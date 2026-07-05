-- crm-clientes-empresa-vs-contacto: columna Empresa (razón social) separada de la
-- persona de contacto (nombre/apellido, que no se toca). ADITIVA, nullable, sin DROP.

-- AlterTable: cliente
ALTER TABLE "crm"."cliente" ADD COLUMN "razon_social" TEXT;
