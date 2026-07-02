'use client';
import { useRef, useState } from 'react';
import { FileText, Upload, Trash2, Eye, Download } from 'lucide-react';
import type { Documento } from '@/lib/mock/data';
import { Modal } from '@/components/ui/modal';

// Tope por archivo para guardar el contenido (data URL) en localStorage.
// Por encima, se guarda solo metadato (sin vista previa) para no reventar la cuota.
const MAX_PREVIEW_BYTES = 3 * 1024 * 1024;

function fmtTam(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function leerComoDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function esImagen(d: Documento): boolean {
  return d.tipo.startsWith('image/');
}
function esPdf(d: Documento): boolean {
  return d.tipo === 'application/pdf' || d.nombre.toLowerCase().endsWith('.pdf');
}
function esTexto(d: Documento): boolean {
  return d.tipo.startsWith('text/');
}

/** Vista previa de un documento según su tipo (imagen / PDF / texto / descarga). */
function PreviewModal({ doc, onClose }: { doc: Documento | null; onClose: () => void }) {
  if (!doc) return null;
  const sinContenido = !doc.datos;
  return (
    <Modal open={!!doc} title={doc.nombre} onClose={onClose}
      footer={doc.datos
        ? <a className="btn btn-outline btn-sm" href={doc.datos} download={doc.nombre}><Download className="h-4 w-4" /> Descargar</a>
        : undefined}>
      {sinContenido ? (
        <p className="empty-state">Sin contenido guardado — solo metadatos. No hay vista previa disponible.</p>
      ) : esImagen(doc) ? (
        <img src={doc.datos} alt={doc.nombre} className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain" />
      ) : esPdf(doc) || esTexto(doc) ? (
        <iframe src={doc.datos} title={doc.nombre} className="h-[70vh] w-full rounded-lg border border-white/10" />
      ) : (
        <p className="empty-state">Este tipo de archivo no se puede previsualizar. Usa «Descargar».</p>
      )}
    </Modal>
  );
}

/** Lista de documentos incluidos + botón para incluir nuevos + vista previa. */
export function DocumentosPanel({ docs, canUpload = true, onAdd, onRemove }: {
  docs: Documento[];
  canUpload?: boolean;
  onAdd: (doc: Documento) => void;
  onRemove?: (id: number | string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Documento | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const fecha = new Date().toISOString().slice(0, 10);
    const lista = Array.from(files);
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      let datos: string | undefined;
      if (f.size <= MAX_PREVIEW_BYTES) {
        try { datos = await leerComoDataURL(f); } catch { datos = undefined; }
      }
      onAdd({ id: Date.now() + i, nombre: f.name, tipo: f.type || 'archivo', tam: f.size, fecha, datos });
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Documentos ({docs.length})</h4>
        {canUpload && (
          <>
            <input ref={inputRef} type="file" multiple className="hidden"
              onChange={(e) => onFiles(e.target.files)} />
            <button className="btn btn-outline btn-sm" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Incluir documento
            </button>
          </>
        )}
      </div>
      {docs.length === 0 ? (
        <p className="empty-state">Aún no hay documentos incluidos.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => setPreview(d)} title="Previsualizar">
                <FileText className="h-4 w-4 shrink-0 text-[var(--acc)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{d.nombre}</p>
                  <p className="text-[11px] text-[var(--panel-muted)]">{fmtTam(d.tam)} · {d.fecha}{d.datos ? '' : ' · sin vista previa'}</p>
                </div>
              </button>
              <button className="row-action edit" onClick={() => setPreview(d)} title="Previsualizar">
                <Eye className="h-4 w-4" />
              </button>
              {onRemove && (
                <button className="row-action danger" onClick={() => onRemove(d.id)} title="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <PreviewModal doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
