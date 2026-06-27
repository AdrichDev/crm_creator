-- crm: reducir MemberRole a 4 roles (ADMIN, MANAGER, EMPLOYEE, CLIENT).
-- 21 RLS policies dependen de membresia.rol (18 en crm + 3 en storage.objects).
-- Se eliminan, se recrea el enum y se recrean identicas, todo en una transaccion
-- (sin hueco RLS visible). OWNER->ADMIN; RECEPTIONIST/PROFESSIONAL/ACCOUNTANT->EMPLOYEE.
-- No existe concepto de propietario; todos los ADMIN son iguales.

-- 1. Eliminar policies dependientes del tipo/columna rol.
DROP POLICY IF EXISTS "staff_negocio_read" ON "campana";
DROP POLICY IF EXISTS "staff_negocio_read" ON "config_negocio";
DROP POLICY IF EXISTS "staff_negocio_read" ON "documento";
DROP POLICY IF EXISTS "staff_negocio_read" ON "empleado";
DROP POLICY IF EXISTS "staff_negocio_read" ON "etiqueta";
DROP POLICY IF EXISTS "staff_negocio_read" ON "factura";
DROP POLICY IF EXISTS "staff_negocio_read" ON "fichaje";
DROP POLICY IF EXISTS "staff_negocio_read" ON "notificacion";
DROP POLICY IF EXISTS "staff_negocio_read" ON "paquete";
DROP POLICY IF EXISTS "staff_negocio_read" ON "paquete_cliente";
DROP POLICY IF EXISTS "staff_negocio_read" ON "producto";
DROP POLICY IF EXISTS "staff_negocio_read" ON "recurso";
DROP POLICY IF EXISTS "staff_negocio_read" ON "reserva";
DROP POLICY IF EXISTS "staff_negocio_read" ON "servicio";
DROP POLICY IF EXISTS "staff_negocio_read" ON "solicitud_ausencia";
DROP POLICY IF EXISTS "staff_negocio_read" ON "sucursal";
DROP POLICY IF EXISTS "staff_negocio_read" ON "venta";
DROP POLICY IF EXISTS "cliente_read" ON "cliente";
DROP POLICY IF EXISTS "documents_tenant_rw" ON storage.objects;
DROP POLICY IF EXISTS "tbranding_update" ON storage.objects;
DROP POLICY IF EXISTS "tbranding_write" ON storage.objects;

-- 2. Remapear roles legados ANTES de reducir el enum.
UPDATE "membresia" SET "rol" = 'ADMIN'    WHERE "rol" = 'OWNER';
UPDATE "membresia" SET "rol" = 'EMPLOYEE' WHERE "rol" IN ('RECEPTIONIST', 'PROFESSIONAL', 'ACCOUNTANT');

-- 3. Recrear el tipo enum con solo 4 valores.
ALTER TYPE "MemberRole" RENAME TO "MemberRole_old";
CREATE TYPE "MemberRole" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE', 'CLIENT');
ALTER TABLE "membresia" ALTER COLUMN "rol" DROP DEFAULT;
ALTER TABLE "membresia" ALTER COLUMN "rol" TYPE "MemberRole" USING ("rol"::text::"MemberRole");
ALTER TABLE "membresia" ALTER COLUMN "rol" SET DEFAULT 'EMPLOYEE';
DROP TYPE "MemberRole_old";

-- 4. Recrear las policies identicas (referencian el nuevo enum; CLIENT sigue existiendo).
CREATE POLICY "staff_negocio_read" ON "campana" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "config_negocio" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "documento" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "empleado" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "etiqueta" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "factura" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "fichaje" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "notificacion" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "paquete" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "paquete_cliente" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "producto" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "recurso" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "reserva" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "servicio" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "solicitud_ausencia" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "sucursal" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "staff_negocio_read" ON "venta" FOR SELECT TO authenticated USING ( negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "cliente_read" ON "cliente" FOR SELECT TO authenticated USING ( usuario_id = auth.uid() OR negocio_id IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "documents_tenant_rw" ON storage.objects FOR ALL TO authenticated USING ( bucket_id = 'documents'::text AND (storage.foldername(name))[1] IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) ) WITH CHECK ( bucket_id = 'documents'::text AND (storage.foldername(name))[1] IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "tbranding_update" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'tenant-branding'::text AND (storage.foldername(name))[1] IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
CREATE POLICY "tbranding_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'tenant-branding'::text AND (storage.foldername(name))[1] IN ( SELECT membresia.negocio_id FROM membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::"MemberRole" ) );
