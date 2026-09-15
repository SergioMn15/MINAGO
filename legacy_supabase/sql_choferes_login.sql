-- ============================================================
-- SQL IDEMPOTENTE para sistema de login de choferes
-- Ejecuta esto en Supabase SQL Editor después del archivo anterior
-- ============================================================

-- ============================================================
-- Tabla de Choferes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.choferes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario TEXT UNIQUE,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  correo TEXT UNIQUE,
  contraseña_hash TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Compatibilidad con una tabla choferes creada anteriormente.
ALTER TABLE public.choferes
  ADD COLUMN IF NOT EXISTS usuario TEXT;

ALTER TABLE public.choferes
  ADD COLUMN IF NOT EXISTS contraseña_hash TEXT;

UPDATE public.choferes
SET usuario = lower(split_part(correo, '@', 1))
WHERE usuario IS NULL AND correo IS NOT NULL;

UPDATE public.choferes
SET usuario = lower(nombre || '.' || apellido)
WHERE usuario IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS choferes_usuario_key
  ON public.choferes (usuario);

ALTER TABLE public.choferes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'choferes'
      AND policyname = 'allow_select_choferes'
  ) THEN
    CREATE POLICY "allow_select_choferes"
    ON public.choferes
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- ============================================================
-- Tabla de asignaciones Chofer-Unidad
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chofer_unidad_asignacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chofer_id UUID NOT NULL REFERENCES public.choferes(id) ON DELETE CASCADE,
  codigo_unidad TEXT NOT NULL REFERENCES public.unidades_transporte(codigo_unidad) ON DELETE CASCADE,
  asignado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chofer_id, codigo_unidad)
);

ALTER TABLE public.chofer_unidad_asignacion ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chofer_unidad_asignacion'
      AND policyname = 'allow_select_asignaciones'
  ) THEN
    CREATE POLICY "allow_select_asignaciones"
    ON public.chofer_unidad_asignacion
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- ============================================================
-- Unidades de ejemplo
-- ============================================================

INSERT INTO public.unidades_transporte (codigo_unidad, en_ruta)
VALUES
  ('BUS-12', false),
  ('BUS-13', false),
  ('BUS-14', false)
ON CONFLICT (codigo_unidad) DO NOTHING;

-- ============================================================
-- Insertar choferes de ejemplo (SOLO PARA DEMOSTRACIÓN)
-- En producción, hashea con bcrypt en el backend
-- ============================================================

INSERT INTO public.choferes (usuario, nombre, apellido, correo, contraseña_hash, activo)
VALUES
  ('juan', 'Juan', 'Garcia', 'juan@viatitlan.com', 'password123', true),
  ('maria', 'Maria', 'Lopez', 'maria@viatitlan.com', 'password456', true),
  ('carlos', 'Carlos', 'Rodriguez', 'carlos@viatitlan.com', 'password789', true)
ON CONFLICT (correo) DO NOTHING;

-- ============================================================
-- Asignar choferes a unidades
-- ============================================================

INSERT INTO public.chofer_unidad_asignacion (chofer_id, codigo_unidad)
SELECT 
  c.id,
  CASE WHEN c.nombre = 'Juan' THEN 'BUS-12'
       WHEN c.nombre = 'Maria' THEN 'BUS-13'
       WHEN c.nombre = 'Carlos' THEN 'BUS-14'
  END
FROM public.choferes c
WHERE c.nombre IN ('Juan', 'Maria', 'Carlos')
ON CONFLICT (chofer_id, codigo_unidad) DO NOTHING;

-- ============================================================
-- Verificación
-- ============================================================

-- SELECT * FROM public.choferes;
-- SELECT * FROM public.chofer_unidad_asignacion;
