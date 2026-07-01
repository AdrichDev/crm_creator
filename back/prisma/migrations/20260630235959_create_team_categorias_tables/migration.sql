-- Crea las tablas de categorías/equipos deportivos (Team/TeamMember), que
-- faltaban en el historial: las migraciones 20260701000000 y 20260701010000
-- ya asumían su existencia (ALTER TABLE / FK) pero nunca se generó el CREATE
-- TABLE correspondiente (aplicado en local vía `prisma db push`, sin dejar
-- rastro en el historial de migraciones).

-- CreateEnum
CREATE TYPE "crm"."DeporteType" AS ENUM ('FUTBOL_11', 'FUTBOL_7', 'FUTBOL_SALA', 'BALONCESTO', 'NATACION', 'HALTEROFILIA', 'OTRO');

-- CreateTable
CREATE TABLE "crm"."equipo" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "deporte" "crm"."DeporteType" NOT NULL DEFAULT 'OTRO',
    "temporada" TEXT,
    "descripcion" TEXT,
    "color" TEXT,
    "eliminado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."miembro_equipo" (
    "id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "empleado_id" TEXT,
    "socio_id" TEXT,
    "rol" TEXT NOT NULL,
    "dorsal" TEXT,
    "posicion" TEXT,
    "activo_desde" TIMESTAMP(3),
    "contactos_emergencia" JSONB NOT NULL DEFAULT '[]',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "miembro_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipo_negocio_id_idx" ON "crm"."equipo"("negocio_id");

-- CreateIndex
CREATE UNIQUE INDEX "miembro_equipo_equipo_id_empleado_id_key" ON "crm"."miembro_equipo"("equipo_id", "empleado_id");

-- CreateIndex
CREATE UNIQUE INDEX "miembro_equipo_equipo_id_socio_id_key" ON "crm"."miembro_equipo"("equipo_id", "socio_id");

-- AddForeignKey
ALTER TABLE "crm"."equipo" ADD CONSTRAINT "equipo_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."miembro_equipo" ADD CONSTRAINT "miembro_equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "crm"."equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."miembro_equipo" ADD CONSTRAINT "miembro_equipo_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "crm"."empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."miembro_equipo" ADD CONSTRAINT "miembro_equipo_socio_id_fkey" FOREIGN KEY ("socio_id") REFERENCES "crm"."cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
