-- crm-operaos 9.2: direccion estructurada (numero, piso, codigo postal) en cliente y
-- contacto. ADITIVA, todas las columnas nullable, sin DROP ni backfill: las filas
-- existentes conservan el numero embebido en "direccion" y siguen geolocalizando igual.

-- AlterTable: cliente (codigo_postal ya existe de crm-comercial-campo)
ALTER TABLE "crm"."cliente" ADD COLUMN "numero" TEXT;
ALTER TABLE "crm"."cliente" ADD COLUMN "piso" TEXT;

-- AlterTable: contacto
ALTER TABLE "crm"."contacto" ADD COLUMN "numero" TEXT;
ALTER TABLE "crm"."contacto" ADD COLUMN "piso" TEXT;
ALTER TABLE "crm"."contacto" ADD COLUMN "codigo_postal" TEXT;
