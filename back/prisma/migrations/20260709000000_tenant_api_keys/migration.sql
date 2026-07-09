-- crm-tenant-api-keys: fundación de superficie tenant-facing. ADITIVA, sin DROP.
-- tenant_api_key: credencial portador por negocio; solo se persiste el hash SHA-256
--   del token (nunca el valor en claro). tenant_secret: par nombre→valor cifrado
--   AES-256-GCM por negocio, con scope (FRONTEND_PUBLIC servible por /tenant-config,
--   BACKEND_SECRET solo server-side) y keyVersion para rotar la clave maestra sin
--   re-emitir. Ambas son secretos: RLS activa SIN políticas de lectura para
--   authenticated/anon — mismo patrón que credencial_oauth (solo el service role de
--   Prisma, que bypassa RLS, las lee).

-- CreateEnum
CREATE TYPE "crm"."TenantSecretScope" AS ENUM ('FRONTEND_PUBLIC', 'BACKEND_SECRET');

-- CreateTable: tenant_api_key
CREATE TABLE "crm"."tenant_api_key" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "etiqueta" TEXT,
    "ultimo_uso_en" TIMESTAMP(3),
    "revocado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tenant_secret
CREATE TABLE "crm"."tenant_secret" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "scope" "crm"."TenantSecretScope" NOT NULL DEFAULT 'BACKEND_SECRET',
    "valor_cifrado" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "clave_version" INTEGER NOT NULL DEFAULT 1,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_secret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: lookup de la clave por hash (sin timing leak del secreto) + listado por negocio.
CREATE UNIQUE INDEX "tenant_api_key_token_hash_key" ON "crm"."tenant_api_key"("token_hash");
CREATE INDEX "tenant_api_key_negocio_id_idx" ON "crm"."tenant_api_key"("negocio_id");

-- CreateIndex: un secreto por nombre y negocio; lectura filtrada por scope (p. ej. /tenant-config).
CREATE UNIQUE INDEX "tenant_secret_negocio_id_nombre_key" ON "crm"."tenant_secret"("negocio_id", "nombre");
CREATE INDEX "tenant_secret_negocio_id_scope_idx" ON "crm"."tenant_secret"("negocio_id", "scope");

-- AddForeignKey
ALTER TABLE "crm"."tenant_api_key" ADD CONSTRAINT "tenant_api_key_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."tenant_secret" ADD CONSTRAINT "tenant_secret_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: activa RLS SIN políticas para authenticated/anon. Ambas tablas son
-- secretos (token hash / valor cifrado); ninguna policy = denegado por defecto salvo el
-- service role de Prisma.
ALTER TABLE "crm"."tenant_api_key" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."tenant_secret" ENABLE ROW LEVEL SECURITY;
