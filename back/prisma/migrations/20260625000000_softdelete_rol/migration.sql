-- Migración formal de las columnas aditivas aplicadas en sesión 2026-06-25 vía
-- `prisma db execute` (registradas aquí para eliminar el drift schema↔DB; Prisma migrate
-- es la estrategia única). Idempotente (IF NOT EXISTS): si ya existen, no-op.

-- Soft delete: eliminado_en (null = activo; fecha = borrado; hard delete en producción).
ALTER TABLE crm.negocio             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.sucursal            ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.servicio            ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.producto            ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.recurso             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.venta               ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.factura             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.campana             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.fichaje             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.etiqueta            ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.cliente             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.empleado            ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.reserva             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.solicitud_ausencia  ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE crm.paquete             ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;

-- Puesto del empleado (texto libre), distinto de especialidad.
ALTER TABLE crm.empleado            ADD COLUMN IF NOT EXISTS rol text;
