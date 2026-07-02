-- crm-citas-google-calendar (WU1): feed ICS suscribible + push opt-in a Google Calendar.
-- ADITIVA, sin DROP. Añade preferencia de push en usuario y tabla token_calendario.
-- Distinto del resto de crm.* con RLS: token_calendario NO lleva política de lectura
-- para 'authenticated' (el token es un secreto; solo el backend con service role lo lee).

-- AlterTable: usuario
ALTER TABLE "crm"."usuario"
  ADD COLUMN "calendario_push_habilitado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: token_calendario
CREATE TABLE "crm"."token_calendario" (
    "id" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "revocado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regenerado_en" TIMESTAMP(3),

    CONSTRAINT "token_calendario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_calendario_usuario_id_key" ON "crm"."token_calendario"("usuario_id");
CREATE UNIQUE INDEX "token_calendario_token_hash_key" ON "crm"."token_calendario"("token_hash");

-- AddForeignKey
ALTER TABLE "crm"."token_calendario" ADD CONSTRAINT "token_calendario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "crm"."usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: activa RLS SIN políticas de lectura para 'authenticated'/'anon'.
-- A diferencia de equipo/recordatorio/etc. (lectura staff del negocio), este token es
-- un secreto personal: ninguna policy = denegado por defecto para todo rol que no sea
-- el service role de Prisma (que bypassa RLS). El feed público resuelve el token por
-- hash desde el backend, nunca vía Supabase client directo.
ALTER TABLE "crm"."token_calendario" ENABLE ROW LEVEL SECURITY;
