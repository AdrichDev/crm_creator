-- crm-operaos WU5: persistencia de conversaciones/mensajes de Telegram por tenant.
-- ADITIVA, sin DROP. Crea la tabla mensaje_telegram + índices de idempotencia y de
-- lectura por conversación. RLS de lectura para staff (las escrituras van por el
-- backend Prisma/service role, que bypassa RLS), mismo patrón que visita/nota_cliente.

-- CreateTable: mensaje_telegram
CREATE TABLE "crm"."mensaje_telegram" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "conversacion_id" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "proveedor_mensaje_id" TEXT,
    "cliente_mensaje_id" TEXT,
    "remitente" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensaje_telegram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: idempotencia de entrada (webhook) y de salida (respuesta manual).
-- NULLs son distintos en Postgres → los salientes sin proveedor / entrantes sin
-- cliente no colisionan entre sí.
CREATE UNIQUE INDEX "telegram_msg_provider_uq" ON "crm"."mensaje_telegram"("negocio_id", "proveedor_mensaje_id");
CREATE UNIQUE INDEX "telegram_msg_client_uq" ON "crm"."mensaje_telegram"("negocio_id", "cliente_mensaje_id");
CREATE INDEX "mensaje_telegram_negocio_id_conversacion_id_creado_en_idx" ON "crm"."mensaje_telegram"("negocio_id", "conversacion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "crm"."mensaje_telegram" ADD CONSTRAINT "mensaje_telegram_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (lectura staff; escrituras por backend service role). Patrón visita/nota_cliente.
ALTER TABLE "crm"."mensaje_telegram" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_negocio_read" ON "crm"."mensaje_telegram"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));
