-- Migración aditiva: añade @@unique([tipo, businessId, destino, programadoEn]) a notificacion.
-- Propósito: idempotencia de recordatorios — upsert absorbe duplicados (P2002).
-- NO DROP de tablas externas (crm_project, tenants_registry, etc.).
-- La tabla puede vivir como crm.notificacion (post-rename) o "Notification" (original).
-- Se intenta la versión castellana primero (crm schema); si no existe, la versión inglesa.

-- Versión castellana (post-rename a español, crm schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'crm' AND tablename = 'notificacion'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'crm' AND tablename = 'notificacion'
        AND indexname = 'notificacion_tipo_negocio_id_destino_programado_en_key'
    ) THEN
      ALTER TABLE crm.notificacion
        ADD CONSTRAINT notificacion_tipo_negocio_id_destino_programado_en_key
        UNIQUE (tipo, negocio_id, destino, programado_en);
    END IF;
  END IF;
END $$;

-- Versión inglesa original (si todavía existe la tabla sin renombrar)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Notification'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Notification'
        AND indexname = 'Notification_type_businessId_target_scheduledAt_key'
    ) THEN
      ALTER TABLE "Notification"
        ADD CONSTRAINT "Notification_type_businessId_target_scheduledAt_key"
        UNIQUE ("type", "businessId", "target", "scheduledAt");
    END IF;
  END IF;
END $$;
