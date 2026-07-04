-- crm-paridad-facturas-pedidos-aa (Fase 1.2 / PR-2): Pedido/Presupuesto documental.
-- ADITIVA, sin DROP. Crea las tablas crm.pedido y crm.linea_pedido (espejo de
-- Budget/BudgetLine de agents-agency adaptado al CRM: negocio_id, dinero DECIMAL,
-- columnas castellano, soft-delete eliminado_en). Superficie NUEVA e independiente
-- de crm.venta (TPV/carrito), que NO se toca. La factura se auto-crea al aceptar en
-- PR-2b (columna pedido_id @unique en crm.factura), fuera de esta migración.
--
-- NO APLICADA por el agente (convención PR-1): se escribe y se marca; el `db push` /
-- migrate deploy lo ejecuta el responsable humano tras revisar la PR.

-- CreateTable: pedido
CREATE TABLE "crm"."pedido" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "cliente_id" TEXT,
    "snapshot_cliente" JSONB NOT NULL DEFAULT '{}',
    "snapshot_emisor" JSONB NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'generada',
    "subtotal_impl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "subtotal_mant" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_impl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_mant" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tasa_iva" DECIMAL(65,30) NOT NULL DEFAULT 0.21,
    "dias_validez" INTEGER NOT NULL DEFAULT 30,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable: linea_pedido
CREATE TABLE "crm"."linea_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL DEFAULT '',
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_impl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "precio_mant" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "posicion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "linea_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedido_negocio_id_creado_en_idx" ON "crm"."pedido"("negocio_id", "creado_en");
CREATE INDEX "linea_pedido_pedido_id_idx" ON "crm"."linea_pedido"("pedido_id");

-- AddForeignKey
ALTER TABLE "crm"."pedido" ADD CONSTRAINT "pedido_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."pedido" ADD CONSTRAINT "pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "crm"."cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm"."linea_pedido" ADD CONSTRAINT "linea_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "crm"."pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (lectura staff; escrituras por backend service role que bypassa RLS).
-- Mismo patrón que crm.estado_visita/visita/nota_cliente/recordatorio (comercial_campo).
ALTER TABLE "crm"."pedido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."linea_pedido" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_negocio_read" ON "crm"."pedido"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));

-- linea_pedido no tiene negocio_id: se autoriza a través del pedido padre.
CREATE POLICY "staff_negocio_read" ON "crm"."linea_pedido"
  FOR SELECT TO authenticated
  USING (pedido_id IN (
    SELECT p.id FROM crm.pedido p
    WHERE p.negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole")
  ));
