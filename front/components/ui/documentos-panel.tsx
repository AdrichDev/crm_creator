'use client';
import { useRef } from 'react';
import { FileText, Upload, Trash2 } from 'lucide-react';
import type { Documento } from '@/lib/mock/data';

function fmtTam(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Lista de documentos incluidos + botón para incluir nuevos (metadatos). */
export function DocumentosPanel({ docs, canUpload = true, onAdd, onRemove }: {
  docs: Documento[];
  canUpload?: boolean;
  onAdd: (doc: Documento) => void;
  onRemove?: (id: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onFiles(files: FileList | null) {
    if (!files) return;
    const fecha = new Date().toISOString().slice(0, 10);
    Array.from(files).forEach((f, i) => onAdd({
      id: Date.now() + i,
      nombre: f.name,
      tipo: f.type || 'archivo',
      tam: f.size,
      fecha,
    }));
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
              <FileText className="h-4 w-4 shrink-0 text-[var(--acc)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{d.nombre}</p>
                <p className="text-[11px] text-[var(--panel-muted)]">{fmtTam(d.tam)} · {d.fecha}</p>
              </div>
              {onRemove && (
                <button className="row-action danger" onClick={() => onRemove(d.id)} title="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
