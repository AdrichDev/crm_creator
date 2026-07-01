-- Activa RLS en equipo/miembro_equipo (quedaron sin RLS al crearse via db push,
-- a diferencia del resto de tablas de crm.*). Mismo patron staff_negocio_read
-- que reserva/empleado: SELECT para authenticated con negocio_id en las
-- membresias del usuario (rol != CLIENT). Escrituras van por el backend
-- (Prisma, service role, bypassa RLS).

ALTER TABLE "crm"."equipo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."miembro_equipo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_negocio_read" ON "crm"."equipo"
  FOR SELECT TO authenticated
  USING (
    negocio_id IN (
      SELECT membresia.negocio_id FROM crm.membresia
      WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"
    )
  );

CREATE POLICY "staff_negocio_read" ON "crm"."miembro_equipo"
  FOR SELECT TO authenticated
  USING (
    equipo_id IN (
      SELECT e.id FROM crm.equipo e
      WHERE e.negocio_id IN (
        SELECT membresia.negocio_id FROM crm.membresia
        WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"
      )
    )
  );
