-- Migración aditiva: marca de generación del proyecto en crm.negocio.
--   generado_en: timestamp en que el paquete del proyecto se GENERÓ (paso posterior,
--                cuando el Minion o la consola crean el paquete). NULL = solo configurado,
--                aún no generado. La escritura de este campo es de otra fase; aquí solo
--                se AÑADE la columna para poder leerla (estado + listado de proyectos).
-- NO DROP de tablas ni columnas. ADD COLUMN IF NOT EXISTS (idempotente, sin default).
-- Aplicación manual pendiente (no ejecutar contra la BD desde aquí).
ALTER TABLE "crm"."negocio" ADD COLUMN IF NOT EXISTS "generado_en" TIMESTAMP(3);
