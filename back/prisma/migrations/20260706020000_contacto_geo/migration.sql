-- crm-operaos 9.12: geolocalización de contactos (leads/prospectos) para pintarlos en el
-- mapa comercial junto a la cartera de clientes. ADITIVA, todas las columnas nullable
-- (geo_estado con DEFAULT 'PENDING'), sin DROP ni backfill: las filas existentes quedan
-- PENDING hasta que el flujo de geocodificación las resuelva. El tipo enum "crm"."GeoStatus"
-- ya existe (creado en 20260701030000_comercial_campo para el cliente); solo se reutiliza.

-- AlterTable: contacto
ALTER TABLE "crm"."contacto" ADD COLUMN "latitud" DOUBLE PRECISION;
ALTER TABLE "crm"."contacto" ADD COLUMN "longitud" DOUBLE PRECISION;
ALTER TABLE "crm"."contacto" ADD COLUMN "geo_estado" "crm"."GeoStatus" NOT NULL DEFAULT 'PENDING';
