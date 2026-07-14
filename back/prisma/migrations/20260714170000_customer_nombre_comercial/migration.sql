-- crm-cliente-nombre-comercial (S2): nombre comercial (marca) separado de la razón social
-- (nombre legal). ADITIVA, sin DROP. Nullable → los clientes existentes migran sin tocarse.
-- La lista de clientes muestra nombre_comercial (con fallback a razón social); la razón
-- social queda solo visible en ficha/edición del cliente.

-- AlterTable
ALTER TABLE "crm"."cliente" ADD COLUMN "nombre_comercial" TEXT;
