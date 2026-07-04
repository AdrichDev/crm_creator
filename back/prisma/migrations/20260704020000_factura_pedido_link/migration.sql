-- crm-paridad-facturas-pedidos-aa (Fase 1.2b / PR-2b): vínculo factura↔pedido.
-- ADITIVA, sin DROP. Añade la columna crm.factura.pedido_id (NULLABLE + UNIQUE) y su FK
-- a crm.pedido. Es la clave de idempotencia de la auto-factura al aceptar un pedido
-- (espejo de Invoice.budgetId en agents-agency): un reproceso de la transición a
-- `aceptada` choca con P2002 en pedido_id y se ignora, en vez de crear una 2ª factura.
--
-- Por qué NULLABLE + UNIQUE: Postgres permite múltiples NULL bajo un índice único, así que
-- las facturas manuales/del operador (POST /service/operator/invoices, pedido_id NULL)
-- conviven sin colisión; solo se garantiza como máximo 1 factura por pedido.
-- NO se pone `numero` como único: rompería el contrato vigente (el operador admite `numero`
-- duplicado entre negocios — ver caracterización 1.1).
--
-- Por qué onDelete SET NULL: la factura es el registro financiero durable. Si el pedido se
-- borra en duro, la factura sobrevive con pedido_id NULL, en vez de bloquear el borrado
-- (RESTRICT) o desaparecer (CASCADE). Además es compatible con el CASCADE de negocio→pedido
-- y negocio→factura (no crea un ciclo de borrado en conflicto).
--
-- NO APLICADA por el agente (convención PR-1/PR-2): se escribe y se marca; el `migrate
-- deploy` lo ejecuta el responsable humano tras revisar la PR.

-- AddColumn
ALTER TABLE "crm"."factura" ADD COLUMN "pedido_id" TEXT;

-- CreateIndex (único; NULLs no colisionan en Postgres)
CREATE UNIQUE INDEX "factura_pedido_id_key" ON "crm"."factura"("pedido_id");

-- AddForeignKey
ALTER TABLE "crm"."factura" ADD CONSTRAINT "factura_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "crm"."pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
