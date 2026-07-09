-- crm-env-contract-tiers (WU3): puente build-time. ADITIVA, sin DROP — depende
-- de la migración de crm-tenant-api-keys (20260709000000_tenant_api_keys), que
-- crea tenant_secret. Columna nullable: el mapeo secreto→variable de build solo
-- tiene sentido para scope=FRONTEND_PUBLIC (validado en el alta, no en BD);
-- FRONTEND_PUBLIC sin env_var se sigue sirviendo por /tenant-config sin hornearse.

-- AlterTable
ALTER TABLE "crm"."tenant_secret" ADD COLUMN "env_var" TEXT;
