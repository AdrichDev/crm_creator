-- crm-cita-cliente-contacto (S3): una cita puede ser de un contacto/lead, no solo de un
-- Customer o un Team. ADITIVA, sin DROP. contacto_id nullable + FK opcional (ON DELETE SET
-- NULL, igual que cliente_id) → las reservas existentes migran sin tocarse. El XOR
-- (a lo sumo uno de cliente/equipo/contacto) se valida en el router, no en la base.

-- AlterTable
ALTER TABLE "crm"."reserva" ADD COLUMN "contacto_id" TEXT;

-- CreateIndex
CREATE INDEX "reserva_contacto_id_idx" ON "crm"."reserva"("contacto_id");

-- AddForeignKey
ALTER TABLE "crm"."reserva" ADD CONSTRAINT "reserva_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "crm"."contacto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
