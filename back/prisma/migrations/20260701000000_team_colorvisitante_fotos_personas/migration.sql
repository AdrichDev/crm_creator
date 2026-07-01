-- Equipación visitante del equipo + foto de perfil para empleados y clientes
-- (módulo Categorías: vista tabla/tarjetas con foto, kit local/visitante).
ALTER TABLE "crm"."equipo" ADD COLUMN IF NOT EXISTS "color_visitante" TEXT;
ALTER TABLE "crm"."empleado" ADD COLUMN IF NOT EXISTS "imagen_url" TEXT;
ALTER TABLE "crm"."cliente" ADD COLUMN IF NOT EXISTS "imagen_url" TEXT;
