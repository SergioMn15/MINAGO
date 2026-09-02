-- ============================================================
-- SQL IDEMPOTENTE para soporte de múltiples unidades y rutas
-- Ejecuta esto en Supabase SQL Editor
-- ============================================================

-- 1) Crear tabla de unidades_transporte si no existe
CREATE TABLE IF NOT EXISTS public.unidades_transporte (
  codigo_unidad TEXT PRIMARY KEY,
  nombre_chofer TEXT,
  ruta_actual TEXT,
  sentido TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  en_ruta BOOLEAN DEFAULT false,
  color_ruta TEXT,
  ultima_actualizacion TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Añadir columnas si no existen (idempotente)
ALTER TABLE public.unidades_transporte
  ADD COLUMN IF NOT EXISTS nombre_chofer TEXT,
  ADD COLUMN IF NOT EXISTS ruta_actual TEXT,
  ADD COLUMN IF NOT EXISTS sentido TEXT,
  ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS en_ruta BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS color_ruta TEXT,
  ADD COLUMN IF NOT EXISTS ultima_actualizacion TIMESTAMPTZ DEFAULT NOW();

-- 3) Activar Row Level Security
ALTER TABLE public.unidades_transporte ENABLE ROW LEVEL SECURITY;

-- 4) Crear políticas RLS si no existen (usando DO $$ para idempotencia)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'unidades_transporte'
      AND policyname = 'allow_insert_unidades'
  ) THEN
    CREATE POLICY "allow_insert_unidades"
    ON public.unidades_transporte
    FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'unidades_transporte'
      AND policyname = 'allow_update_unidades'
  ) THEN
    CREATE POLICY "allow_update_unidades"
    ON public.unidades_transporte
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'unidades_transporte'
      AND policyname = 'allow_select_unidades'
  ) THEN
    CREATE POLICY "allow_select_unidades"
    ON public.unidades_transporte
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- ============================================================
-- Tabla de Rutas (usa la estructura existente)
-- ============================================================

-- Solo activar RLS si no está activado
ALTER TABLE public.rutas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rutas'
      AND policyname = 'allow_select_rutas'
  ) THEN
    CREATE POLICY "allow_select_rutas"
    ON public.rutas
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- ============================================================
-- Insertar rutas de ejemplo (idempotente)
-- ============================================================

-- Insertar solo nombres y colores (geojson se carga desde archivos en el frontend)
INSERT INTO public.rutas (nombre, color, geojson)
VALUES
  ('Ruta Azul', '#1d4ed8', '{"type":"FeatureCollection","features":[]}'::jsonb),
  ('Ruta Amarillo', '#f59e0b', '{"type":"FeatureCollection","features":[]}'::jsonb)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- Verificación: Listar tabla estructura
-- ============================================================

-- Ejecuta esto después para confirmar que todo está bien:
-- SELECT * FROM information_schema.columns WHERE table_name = 'unidades_transporte';
-- SELECT * FROM information_schema.columns WHERE table_name = 'rutas';
