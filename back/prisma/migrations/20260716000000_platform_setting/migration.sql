-- crm-central-oauth-admin-config: tabla de ajustes de PLATAFORMA cifrados. ADITIVA,
-- sin DROP. platform_setting guarda credenciales CENTRALES de la plataforma (hoy la
-- app Google OAuth compartida: GOOGLE_OAUTH_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI)
-- como par clave→valor cifrado AES-256-GCM (misma clave maestra SECRETS_MASTER_KEY
-- que tenant_secret, con clave_version para rotar sin re-emitir). No hay negocio_id:
-- es config de plataforma, no per-tenant. RLS activa SIN políticas para
-- authenticated/anon — mismo patrón que tenant_secret/credencial_oauth: la tabla es
-- un secreto y ninguna policy = denegado por defecto salvo el service role de Prisma.

-- CreateTable: platform_setting
CREATE TABLE "crm"."platform_setting" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor_cifrado" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "clave_version" INTEGER NOT NULL DEFAULT 1,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: una fila por clave (upsert por clave).
CREATE UNIQUE INDEX "platform_setting_clave_key" ON "crm"."platform_setting"("clave");

-- Row Level Security: activa RLS SIN políticas. La tabla es un secreto (valor
-- cifrado); ninguna policy = denegado por defecto salvo el service role de Prisma.
ALTER TABLE "crm"."platform_setting" ENABLE ROW LEVEL SECURITY;
