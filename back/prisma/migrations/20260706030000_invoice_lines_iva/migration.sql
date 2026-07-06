-- crm-operaos 10.3: facturación DETALLADA como AA (líneas + IVA en la propia factura).
-- ADITIVA, sin DROP. Añade a crm.factura el desglose autocontenido (subtotal/tasa_iva/
-- pagada_en) y crea crm.linea_factura (espejo de las convenciones de crm.linea_pedido).
--
-- INVARIANTE DE LA MIGRACIÓN (verificable): TODAS las facturas existentes conservan su
-- `total` EXACTO. Estados reales en BD a fecha de la migración (SELECT DISTINCT estado):
-- 'Pendiente' y 'Pagada' — ambos dentro del set cerrado Pendiente|Pagada|Anulada; ninguna
-- fila queda huérfana. Las facturas legacy (planas) se backfillean como documento de UNA
-- línea (nombre = servicio_nombre o 'Servicio', importe = total, cantidad 1) con tasa_iva=0
-- y subtotal=total: NO se les fabrica un desglose de IVA 21% retroactivo. pagada_en queda
-- NULL incluso en las ya 'Pagada' (no se inventa una fecha de cobro histórica); lo gestiona
-- PUT /invoices/:id/status de aquí en adelante.
--
-- NO APLICADA por el agente (convención PR-1): se escribe y se marca; el `migrate deploy`
-- lo ejecuta el responsable humano tras revisar la PR.

-- AlterTable: factura (desglose autocontenido)
ALTER TABLE "crm"."factura" ADD COLUMN "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "crm"."factura" ADD COLUMN "tasa_iva" DECIMAL(65,30) NOT NULL DEFAULT 0.21;
ALTER TABLE "crm"."factura" ADD COLUMN "pagada_en" TIMESTAMP(3);

-- CreateTable: linea_factura
CREATE TABLE "crm"."linea_factura" (
    "id" TEXT NOT NULL,
    "factura_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_unit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "importe" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "posicion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "linea_factura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "linea_factura_factura_id_idx" ON "crm"."linea_factura"("factura_id");

-- AddForeignKey
ALTER TABLE "crm"."linea_factura" ADD CONSTRAINT "linea_factura_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "crm"."factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (lectura staff; escrituras por backend service role que bypassa RLS).
-- Mismo patrón que crm.linea_pedido: sin negocio_id propio, se autoriza vía la factura padre.
ALTER TABLE "crm"."linea_factura" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_negocio_read" ON "crm"."linea_factura"
  FOR SELECT TO authenticated
  USING (factura_id IN (
    SELECT f.id FROM crm.factura f
    WHERE f.negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole")
  ));

-- Backfill LEGACY: cada factura plana existente pasa a documento autocontenido de UNA línea
-- con importe = total y tasa_iva = 0 (subtotal = total ⇒ IVA mostrado = 0, sin inventar
-- desglose). Se incluyen TAMBIÉN las soft-deleted (eliminado_en != NULL): siguen en BD y
-- deben conservar su detalle si se restauran. Idempotencia defensiva: solo facturas sin
-- líneas previas (en una BD recién migrada, todas).
UPDATE "crm"."factura" SET "subtotal" = "total", "tasa_iva" = 0;

INSERT INTO "crm"."linea_factura" ("id", "factura_id", "nombre", "descripcion", "cantidad", "precio_unit", "importe", "posicion")
SELECT gen_random_uuid()::text,
       f."id",
       COALESCE(NULLIF(TRIM(f."servicio_nombre"), ''), 'Servicio'),
       NULL,
       1,
       f."total",
       f."total",
       0
FROM "crm"."factura" f
WHERE NOT EXISTS (SELECT 1 FROM "crm"."linea_factura" l WHERE l."factura_id" = f."id");
