-- crm-tenant-lifecycle-gate WU1: ciclo de vida (kill switch) por negocio. ADITIVA, sin DROP.
-- Enum TenantLifecycle + columnas en negocio (default 'ACTIVE' → los negocios existentes
-- migran sin cortarse) + tabla de auditoría inmutable tenant_state_event. Ningún cambio de
-- estado modela borrado: TERMINATED es acceso cortado, no destrucción.

-- CreateEnum
CREATE TYPE "crm"."TenantLifecycle" AS ENUM ('ACTIVE', 'GRACE', 'SUSPENDED', 'TERMINATED');

-- AlterTable: estado del kill switch en negocio. default 'ACTIVE' = auto-encendido; los
-- campos de gracia/suspensión son nullable y solo aplican en sus estados.
ALTER TABLE "crm"."negocio" ADD COLUMN "ciclo_vida" "crm"."TenantLifecycle" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "crm"."negocio" ADD COLUMN "gracia_hasta" TIMESTAMP(3);
ALTER TABLE "crm"."negocio" ADD COLUMN "suspendido_en" TIMESTAMP(3);

-- CreateTable: tenant_state_event (auditoría append-only de transiciones)
CREATE TABLE "crm"."tenant_state_event" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "estado_origen" "crm"."TenantLifecycle" NOT NULL,
    "estado_destino" "crm"."TenantLifecycle" NOT NULL,
    "motivo" TEXT,
    "actor" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_state_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: histórico por negocio ordenado por fecha.
CREATE INDEX "tenant_state_event_negocio_id_creado_en_idx" ON "crm"."tenant_state_event"("negocio_id", "creado_en");

-- AddForeignKey
ALTER TABLE "crm"."tenant_state_event" ADD CONSTRAINT "tenant_state_event_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
