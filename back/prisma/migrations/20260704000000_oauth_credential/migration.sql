-- crm-integraciones-comunicacion (WU1): credencial OAuth por negocio (Gmail/Calendar)
-- o de plataforma (negocio_id NULL, scope='admin'). ADITIVA, sin DROP.
-- Tokens SIEMPRE cifrados enc:v1: (AES-256-GCM). Revoke = SOFT-delete.
-- Como token_calendario: RLS activa SIN políticas de lectura para authenticated/anon —
-- es un secreto, solo el service role de Prisma (que bypassa RLS) lo lee.

-- CreateEnum
CREATE TYPE "crm"."ServicioIntegracion" AS ENUM ('gmail', 'whatsapp', 'calendar');

-- CreateTable: credencial_oauth
CREATE TABLE "crm"."credencial_oauth" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT,
    "servicio" "crm"."ServicioIntegracion" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'tenant',
    "token_acceso" TEXT NOT NULL,
    "token_refresco" TEXT,
    "expira_en" TIMESTAMP(3),
    "scopes_oauth" TEXT[],
    "estado" TEXT NOT NULL DEFAULT 'connected',
    "revocado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credencial_oauth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: una credencial activa por (negocio, servicio). NULL en negocio_id se trata
-- como distinto (Postgres), así que NO restringe filas admin — para eso hará falta un índice
-- parcial en WU3 (calendar admin). En WU1 (Gmail per-business) negocio_id siempre está.
CREATE UNIQUE INDEX "credencial_oauth_negocio_id_servicio_key" ON "crm"."credencial_oauth"("negocio_id", "servicio");

-- AddForeignKey
ALTER TABLE "crm"."credencial_oauth" ADD CONSTRAINT "credencial_oauth_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: activa RLS SIN políticas para authenticated/anon. Los tokens son
-- secretos; ninguna policy = denegado por defecto salvo el service role de Prisma.
ALTER TABLE "crm"."credencial_oauth" ENABLE ROW LEVEL SECURITY;
