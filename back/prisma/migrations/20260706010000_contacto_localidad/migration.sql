-- crm-operaos 9.2 (2a pasada): añade "localidad" a contacto. ADITIVA, nullable,
-- sin DROP ni backfill. Cliente ya tenia localidad (crm-comercial-campo); esto
-- solo lo iguala en contacto.

-- AlterTable: contacto
ALTER TABLE "crm"."contacto" ADD COLUMN "localidad" TEXT;
