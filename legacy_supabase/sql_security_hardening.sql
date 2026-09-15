-- Ejecutar UNA VEZ en Supabase SQL Editor después de los scripts existentes.
-- Conserva las credenciales demo actuales, pero deja de exponerlas al navegador.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.chofer_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chofer_id UUID NOT NULL REFERENCES public.choferes(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_en TIMESTAMPTZ NOT NULL,
  revocada_en TIMESTAMPTZ,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chofer_sesiones_token_hash_idx
  ON public.chofer_sesiones(token_hash);

CREATE TABLE IF NOT EXISTS public.recorridos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chofer_id UUID NOT NULL REFERENCES public.choferes(id),
  codigo_unidad TEXT NOT NULL REFERENCES public.unidades_transporte(codigo_unidad),
  ruta_actual TEXT NOT NULL,
  sentido TEXT,
  inicio_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin_en TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS recorridos_unidad_activa_idx
  ON public.recorridos(codigo_unidad) WHERE fin_en IS NULL;

CREATE TABLE IF NOT EXISTS public.historial_ubicaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorrido_id UUID REFERENCES public.recorridos(id) ON DELETE SET NULL,
  codigo_unidad TEXT NOT NULL,
  latitud DOUBLE PRECISION NOT NULL,
  longitud DOUBLE PRECISION NOT NULL,
  registrada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS historial_ubicaciones_unidad_fecha_idx
  ON public.historial_ubicaciones(codigo_unidad, registrada_en DESC);

ALTER TABLE public.unidades_transporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choferes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chofer_unidad_asignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chofer_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recorridos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_ubicaciones ENABLE ROW LEVEL SECURITY;

-- Se eliminan las políticas abiertas de la fase de demostración.
DROP POLICY IF EXISTS "allow_insert_unidades" ON public.unidades_transporte;
DROP POLICY IF EXISTS "allow_update_unidades" ON public.unidades_transporte;
DROP POLICY IF EXISTS "allow_select_unidades" ON public.unidades_transporte;
DROP POLICY IF EXISTS "allow_select_choferes" ON public.choferes;
DROP POLICY IF EXISTS "allow_select_asignaciones" ON public.chofer_unidad_asignacion;

-- El mapa requiere lectura. No contiene contraseñas ni datos de sesión.
DROP POLICY IF EXISTS "public_read_unidades" ON public.unidades_transporte;
CREATE POLICY "public_read_unidades"
  ON public.unidades_transporte FOR SELECT
  USING (true);

-- No se crean políticas directas para perfiles, asignaciones o sesiones.
-- El acceso se realiza exclusivamente a través de las funciones siguientes.

CREATE OR REPLACE FUNCTION public.authenticate_driver(
  p_usuario TEXT,
  p_contrasena TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chofer RECORD;
  v_token TEXT;
BEGIN
  SELECT c.id, c.nombre, c.apellido, a.codigo_unidad
  INTO v_chofer
  FROM public.choferes c
  JOIN public.chofer_unidad_asignacion a ON a.chofer_id = c.id
  WHERE lower(c.usuario) = lower(trim(p_usuario))
    AND c.contraseña_hash = p_contrasena
    AND c.activo = true
  ORDER BY a.asignado_en
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.chofer_sesiones (chofer_id, token_hash, expira_en)
  VALUES (v_chofer.id, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'::text), 'hex'), NOW() + INTERVAL '12 hours');

  RETURN jsonb_build_object(
    'session_token', v_token,
    'chofer_id', v_chofer.id,
    'nombre_completo', trim(v_chofer.nombre || ' ' || v_chofer.apellido),
    'codigo_unidad', v_chofer.codigo_unidad
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_driver_location(
  p_session_token TEXT,
  p_latitud DOUBLE PRECISION,
  p_longitud DOUBLE PRECISION,
  p_ruta_actual TEXT,
  p_sentido TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo_unidad TEXT;
  v_chofer_id UUID;
  v_recorrido_id UUID;
BEGIN
  SELECT a.codigo_unidad, s.chofer_id INTO v_codigo_unidad, v_chofer_id
  FROM public.chofer_sesiones s
  JOIN public.chofer_unidad_asignacion a ON a.chofer_id = s.chofer_id
  WHERE s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'::text), 'hex')
    AND s.revocada_en IS NULL
    AND s.expira_en > NOW()
  ORDER BY a.asignado_en
  LIMIT 1;

  IF v_codigo_unidad IS NULL THEN
    RAISE EXCEPTION 'Sesión inválida o expirada';
  END IF;
  IF p_latitud NOT BETWEEN -90 AND 90 OR p_longitud NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas fuera de rango';
  END IF;
  IF p_ruta_actual NOT IN ('Ruta Azul', 'Ruta Amarillo') THEN
    RAISE EXCEPTION 'Ruta no permitida';
  END IF;

  UPDATE public.unidades_transporte
  SET latitud = p_latitud,
      longitud = p_longitud,
      en_ruta = true,
      ruta_actual = p_ruta_actual,
      sentido = left(coalesce(p_sentido, ''), 100),
      color_ruta = CASE WHEN p_ruta_actual = 'Ruta Amarillo' THEN '#f59e0b' ELSE '#1d4ed8' END,
      ultima_actualizacion = NOW()
  WHERE codigo_unidad = v_codigo_unidad;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La unidad asignada no existe';
  END IF;

  INSERT INTO public.recorridos (chofer_id, codigo_unidad, ruta_actual, sentido)
  VALUES (v_chofer_id, v_codigo_unidad, p_ruta_actual, left(coalesce(p_sentido, ''), 100))
  ON CONFLICT (codigo_unidad) WHERE fin_en IS NULL DO NOTHING;

  SELECT id INTO v_recorrido_id
  FROM public.recorridos
  WHERE codigo_unidad = v_codigo_unidad AND fin_en IS NULL;

  INSERT INTO public.historial_ubicaciones (recorrido_id, codigo_unidad, latitud, longitud)
  VALUES (v_recorrido_id, v_codigo_unidad, p_latitud, p_longitud);
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_driver_route(
  p_session_token TEXT,
  p_ruta_actual TEXT,
  p_sentido TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo_unidad TEXT;
BEGIN
  SELECT a.codigo_unidad INTO v_codigo_unidad
  FROM public.chofer_sesiones s
  JOIN public.chofer_unidad_asignacion a ON a.chofer_id = s.chofer_id
  WHERE s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'::text), 'hex')
    AND s.revocada_en IS NULL
    AND s.expira_en > NOW()
  ORDER BY a.asignado_en
  LIMIT 1;

  IF v_codigo_unidad IS NULL THEN
    RAISE EXCEPTION 'Sesión inválida o expirada';
  END IF;

  UPDATE public.unidades_transporte
  SET en_ruta = false,
      ruta_actual = coalesce(p_ruta_actual, ruta_actual),
      sentido = coalesce(left(p_sentido, 100), sentido),
      ultima_actualizacion = NOW()
  WHERE codigo_unidad = v_codigo_unidad;

  UPDATE public.recorridos
  SET fin_en = NOW()
  WHERE codigo_unidad = v_codigo_unidad AND fin_en IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.logout_driver(p_session_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.chofer_sesiones
  SET revocada_en = NOW()
  WHERE token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'::text), 'hex')
    AND revocada_en IS NULL;
$$;

REVOKE ALL ON TABLE public.chofer_sesiones FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.authenticate_driver(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_driver_location(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_driver_route(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.logout_driver(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_driver(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_driver_location(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stop_driver_route(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_driver(TEXT) TO anon, authenticated;

-- Verificación manual esperada: estas tablas no deben devolver filas al usar la clave anon.
-- SELECT * FROM public.choferes;
-- SELECT * FROM public.chofer_unidad_asignacion;
