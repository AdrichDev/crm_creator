-- crm-operaos WU6: fichaje con máquina de estados por día y modo (AC6). ADITIVA, sin
-- DROP — la tabla fichaje (legacy, resumen entrada+salida) se mantiene intacta para no
-- perder el histórico. evento_jornada guarda cada PASO como fila propia (entrada,
-- salida_comida, entrada_comida, salida_final), lo que permite validar la secuencia
-- (ver back/src/lib/fichaje.ts).

-- CreateTable: evento_jornada
CREATE TABLE "crm"."evento_jornada" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "modo" TEXT NOT NULL,
    "paso" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_jornada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: idempotencia — no se puede fichar el mismo paso dos veces el mismo día
-- (defensa en profundidad además de la validación de secuencia en la ruta).
CREATE UNIQUE INDEX "workday_event_uq" ON "crm"."evento_jornada"("empleado_id", "fecha", "paso");
CREATE INDEX "evento_jornada_negocio_id_empleado_id_fecha_idx" ON "crm"."evento_jornada"("negocio_id", "empleado_id", "fecha");

-- AddForeignKey
ALTER TABLE "crm"."evento_jornada" ADD CONSTRAINT "evento_jornada_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm"."evento_jornada" ADD CONSTRAINT "evento_jornada_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "crm"."empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (lectura staff; escrituras por backend service role). Patrón mensaje_telegram/visita.
ALTER TABLE "crm"."evento_jornada" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_negocio_read" ON "crm"."evento_jornada"
  FOR SELECT TO authenticated
  USING (negocio_id IN (SELECT membresia.negocio_id FROM crm.membresia WHERE membresia.usuario_id = auth.uid() AND membresia.rol <> 'CLIENT'::crm."MemberRole"));
