-- crm-operaos WU4: agenda de contactos comerciales (leads / prospectos) por tenant.
-- ADITIVA, sin DROP. Crea la tabla contacto + índices y FKs. RLS de lectura para staff
-- (las escrituras van por el backend Prisma/service role, que bypassa RLS), mismo patrón
-- que mensaje_telegram / visita / nota_cliente.

-- CreateTable: contacto
CREATE TABLE "crm"."contacto" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'prospecto',
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "sector" TEXT,
    "direccion" TEXT,
    "peticion" TEXT,
    "contactado" TEXT NOT NULL DEFAULT 'no',
    "contactado_en" TIMESTAMP(3),
    "cliente_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "contacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: código único por negocio (pc-NN secuencial) + índices de lectura.
CREATE UNIQUE INDEX "contacto_negocio_codigo_uq" ON "crm"."contacto"("negocio_id", "codigo");
CREATE INDEX "contacto_negocio_id_idx" ON "crm"."contacto"("negocio_id");
CREATE INDEX "contacto_negocio_id_contactado_idx" ON "crm"."contacto"("negocio_id", "contactado");

-- AddForeignKey
ALTER TABLE "crm"."contacto" ADD CONSTRAINT "contacto_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."contacto" ADD CONSTRAINT "contacto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "crm"."cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (lectura staff; escrituras por backend service role). Patrón mensaje_telegram.
ALTER TABLE "crm"."contacto" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_negocio_read" ON "crm"."contacto"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));
