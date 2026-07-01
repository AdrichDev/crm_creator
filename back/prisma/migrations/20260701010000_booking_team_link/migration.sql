-- Un Booking puede referenciar un Team (entrenamiento) en vez de un Customer.
-- XOR customerId/teamId validado en el router (back/src/routes/bookings.ts),
-- no a nivel de constraint SQL.
ALTER TABLE "crm"."reserva" ADD COLUMN IF NOT EXISTS "equipo_id" TEXT;
ALTER TABLE "crm"."reserva" ADD CONSTRAINT "reserva_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "crm"."equipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "reserva_equipo_id_idx" ON "crm"."reserva" ("equipo_id");
