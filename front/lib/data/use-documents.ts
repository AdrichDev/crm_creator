'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { Documento } from '@/lib/mock/data';

// Fila cruda de Document que devuelve el back (/api/documents).
interface DocumentRow {
  id: string;
  titulo: string;
  tipo: string;         // enum DocumentType de negocio (PAYROLL/CONTRACT/.../OTHER)
  rutaArchivo: string;  // data URL con el contenido
  createdAt: string;
}

// El tipo MIME real viaja dentro del data URL (data:<mime>;base64,...). Lo
// extraemos para que la vista previa del panel (imagen/PDF/texto) siga
// funcionando; el enum de negocio (tipo) no sirve para previsualizar.
function mimeFromDataUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return 'archivo';
  const semi = dataUrl.indexOf(';');
  const comma = dataUrl.indexOf(',');
  const end = semi >= 0 ? semi : comma;
  const mime = end > 5 ? dataUrl.slice(5, end) : '';
  return mime || 'archivo';
}

// Tamaño aproximado a partir del base64 del data URL (4 chars ≈ 3 bytes).
function bytesFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf('base64,');
  if (i < 0) return 0;
  const b64 = dataUrl.slice(i + 7);
  return Math.floor((b64.length * 3) / 4);
}

function toDocumento(row: DocumentRow): Documento {
  return {
    id: row.id,
    nombre: row.titulo,
    tipo: mimeFromDataUrl(row.rutaArchivo),
    tam: bytesFromDataUrl(row.rutaArchivo),
    fecha: (row.createdAt ?? '').slice(0, 10),
    datos: row.rutaArchivo,
  };
}

/**
 * Documentos del negocio activo respaldados por /api/documents (modo API).
 * Document es scoped por negocio (no por cliente/factura), así que el listado
 * es el del negocio completo. En modo local (enabled=false) no hace nada y el
 * panel usa los documentos guardados en la propia entidad (localStorage).
 */
export function useDocumentos(enabled: boolean) {
  const [docs, setDocs] = useState<Documento[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await apiFetch<{ items: DocumentRow[] }>('/documents?limit=100');
      setDocs((r.items ?? []).map(toDocumento));
    } catch { setDocs([]); }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const add = useCallback(async (d: Documento) => {
    if (!enabled) return;
    // El back exige rutaArchivo no vacío; los archivos grandes sin data URL
    // (solo metadatos) no se pueden respaldar → se omiten silenciosamente.
    if (!d.datos) return;
    // El enum de negocio no tiene mapeo obvio desde un MIME → OTHER. El MIME
    // real se conserva dentro del data URL (rutaArchivo) para la vista previa.
    try {
      await apiFetch('/documents', {
        method: 'POST',
        body: JSON.stringify({ titulo: d.nombre, rutaArchivo: d.datos, tipo: 'OTHER' }),
      });
      await refresh();
    } catch { /* el panel no muestra error de subida */ }
  }, [enabled, refresh]);

  const remove = useCallback(async (id: number | string) => {
    if (!enabled) return;
    try {
      await apiFetch(`/documents/${id}`, { method: 'DELETE' });
      await refresh();
    } catch { /* noop */ }
  }, [enabled, refresh]);

  return { docs, add, remove, refresh };
}
