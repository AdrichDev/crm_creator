-- crm-comercial-campo (WU1): CRM comercial de campo geolocalizado.
-- ADITIVA, sin DROP. Extiende cliente (geo/estado-visita/ABC/tipo) y crea las tablas
-- estado_visita / visita / nota_cliente / recordatorio. RLS de lectura para staff (las
-- escrituras van por el backend Prisma/service role, que bypassa RLS), mismo patrón que equipo.

-- CreateEnum
CREATE TYPE "crm"."GeoStatus" AS ENUM ('PENDING', 'OK', 'FAILED');
CREATE TYPE "crm"."AbcCategory" AS ENUM ('A', 'B', 'C');
CREATE TYPE "crm"."RegistroType" AS ENUM ('CLIENTE', 'PROSPECTO');
CREATE TYPE "crm"."NoteOrigin" AS ENUM ('MANUAL', 'AUDIO', 'IMPORT');
CREATE TYPE "crm"."ReminderStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');

-- AlterTable: cliente (columnas aditivas nullable/defaulted)
ALTER TABLE "crm"."cliente"
  ADD COLUMN "localidad" TEXT,
  ADD COLUMN "provincia" TEXT,
  ADD COLUMN "codigo_postal" TEXT,
  ADD COLUMN "latitud" DOUBLE PRECISION,
  ADD COLUMN "longitud" DOUBLE PRECISION,
  ADD COLUMN "geo_estado" "crm"."GeoStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "categoria_abc" "crm"."AbcCategory",
  ADD COLUMN "estado_visita_id" TEXT,
  ADD COLUMN "tipo_registro" "crm"."RegistroType" NOT NULL DEFAULT 'CLIENTE',
  ADD COLUMN "ultima_visita_en" TIMESTAMP(3),
  ADD COLUMN "proxima_accion_en" TIMESTAMP(3);

-- CreateTable: estado_visita
CREATE TABLE "crm"."estado_visita" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#9ca3af',
    "icono" TEXT NOT NULL DEFAULT 'MapPin',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "es_pendiente" BOOLEAN NOT NULL DEFAULT true,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "eliminado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estado_visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable: visita
CREATE TABLE "crm"."visita" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "empleado_id" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" TEXT,
    "nota" TEXT,
    "proxima_accion" TEXT,
    "estado_posterior_id" TEXT,
    "eliminado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable: nota_cliente (INMUTABLE — sin actualizado_en ni eliminado_en)
CREATE TABLE "crm"."nota_cliente" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "autor_id" UUID,
    "texto" TEXT NOT NULL,
    "origen" "crm"."NoteOrigin" NOT NULL DEFAULT 'MANUAL',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable: recordatorio
CREATE TABLE "crm"."recordatorio" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha_prevista" TIMESTAMP(3),
    "estado" "crm"."ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "responsable_id" UUID,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "eliminado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_negocio_id_estado_visita_id_idx" ON "crm"."cliente"("negocio_id", "estado_visita_id");
CREATE INDEX "cliente_negocio_id_tipo_registro_idx" ON "crm"."cliente"("negocio_id", "tipo_registro");
CREATE INDEX "estado_visita_negocio_id_idx" ON "crm"."estado_visita"("negocio_id");
CREATE INDEX "visita_negocio_id_cliente_id_idx" ON "crm"."visita"("negocio_id", "cliente_id");
CREATE INDEX "nota_cliente_negocio_id_cliente_id_idx" ON "crm"."nota_cliente"("negocio_id", "cliente_id");
CREATE INDEX "recordatorio_negocio_id_cliente_id_idx" ON "crm"."recordatorio"("negocio_id", "cliente_id");
CREATE INDEX "recordatorio_negocio_id_estado_fecha_prevista_idx" ON "crm"."recordatorio"("negocio_id", "estado", "fecha_prevista");

-- AddForeignKey
ALTER TABLE "crm"."cliente" ADD CONSTRAINT "cliente_estado_visita_id_fkey" FOREIGN KEY ("estado_visita_id") REFERENCES "crm"."estado_visita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm"."estado_visita" ADD CONSTRAINT "estado_visita_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."visita" ADD CONSTRAINT "visita_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."visita" ADD CONSTRAINT "visita_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "crm"."cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."nota_cliente" ADD CONSTRAINT "nota_cliente_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."nota_cliente" ADD CONSTRAINT "nota_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "crm"."cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."recordatorio" ADD CONSTRAINT "recordatorio_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."recordatorio" ADD CONSTRAINT "recordatorio_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "crm"."cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (lectura staff; escrituras por backend service role). Patrón equipo/reserva.
ALTER TABLE "crm"."estado_visita" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."visita" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."nota_cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."recordatorio" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_negocio_read" ON "crm"."estado_visita"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));

CREATE POLICY "staff_negocio_read" ON "crm"."visita"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));

CREATE POLICY "staff_negocio_read" ON "crm"."nota_cliente"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));

CREATE POLICY "staff_negocio_read" ON "crm"."recordatorio"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));
