'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import { Camera } from 'lucide-react';
import { apiUpload } from '@/lib/api/client';

const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  kind: 'service' | 'product';
  id: string;
  imagenUrl?: string | null;
  // Solo en modo API tiene sentido subir (el endpoint requiere token + negocio).
  enabled: boolean;
  onUploaded: (url: string) => void;
}

// Thumbnail 48x48 con overlay de cámara al hover. Si no hay imagen, muestra un
// placeholder con icono. Sube la imagen al endpoint /upload/{kind}/{id}.
export function ImageCell({ kind, id, imagenUrl, enabled, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('Máx 5 MB');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { url } = await apiUpload<{ url: string }>(`/upload/${kind}/${id}`, fd);
      onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="group relative h-12 w-12 shrink-0">
        {imagenUrl ? (
          <img src={imagenUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/5 text-[var(--panel-text)]/40">
            <Camera className="h-5 w-5" />
          </div>
        )}
        {enabled && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Subir imagen"
            className="absolute inset-0 flex items-center justify-center rounded-lg opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100 disabled:cursor-wait"
          >
            <Camera className="h-4 w-4 text-white" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onPick}
        />
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
