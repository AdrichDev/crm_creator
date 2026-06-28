-- Migración aditiva: columnas de lock + reintentos en notificacion para endurecer
-- el drainer de recordatorios frente a múltiples instancias.
--   locked_at: timestamp del claim (estado 'processing'). Permite reclamar filas
--              colgadas si una instancia muere a mitad de envío.
--   intentos:  contador de reintentos de envío; al alcanzar el tope pasa a 'failed'.
-- NO DROP de tablas ni columnas externas. ADD COLUMN IF NOT EXISTS (idempotente).
-- Soporta tabla castellana (crm.notificacion, post-rename) e inglesa original.

-- Versión castellana (post-rename a español, crm schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'crm' AND tablename = 'notificacion'
  ) THEN
    ALTER TABLE crm.notificacion ADD COLUMN IF NOT EXISTS locked_at timestamptz;
    ALTER TABLE crm.notificacion ADD COLUMN IF NOT EXISTS intentos integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Versión inglesa original (si todavía existe la tabla sin renombrar)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Notification'
  ) THEN
    ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "locked_at" timestamptz;
    ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "intentos" integer NOT NULL DEFAULT 0;
  END IF;
END $$;
