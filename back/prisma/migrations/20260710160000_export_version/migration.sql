-- crm-generator-versiones-historico WU1: historial versionado del generador. ADITIVA,
-- sin DROP. Una fila por export completado (siempre desde ctx.frontDir, formato
-- guardado siempre "source"); ligada a negocio.id. No toca negocio.generado_en ni el
-- campo Project.generatedAt (localStorage), que quedan como deuda documentada.

-- CreateTable
CREATE TABLE "crm"."version_export" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "comentario" TEXT,
    "formato" TEXT NOT NULL,
    "ruta_storage" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: listado/histórico por negocio.
CREATE INDEX "version_export_negocio_id_idx" ON "crm"."version_export"("negocio_id");

-- AddForeignKey
ALTER TABLE "crm"."version_export" ADD CONSTRAINT "version_export_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "crm"."negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
