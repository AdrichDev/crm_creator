'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/api/client';

export interface CustomerDetail {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  localidad?: string;
  provincia?: string;
  estado?: string;
  segmento?: string;
}

// Ficha de cliente al clicar su nombre en /citas — crm-citas-ux-agenda WU6. Mismo
// patrón visual que CitaDetalleModal (dl/dt/dd, ver ui/modal.tsx), fetch de
// GET /customers/:id al abrir.
export function ClienteInfoModal({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) { setData(null); setError(''); return; }
    let cancelled = false;
    setLoading(true); setError(''); setData(null);
    apiFetch<CustomerDetail>(`/customers/${customerId}`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el cliente.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  if (!customerId) return null;

  const campos: [string, string][] = data ? [
    ['Nombre', data.nombre],
    ['Email', data.email || '—'],
    ['Teléfono', data.telefono || '—'],
    ['Dirección', data.direccion || '—'],
    ['Localidad', data.localidad || '—'],
    ['Provincia', data.provincia || '—'],
    ['Estado', data.estado || '—'],
    ['Segmento', data.segmento || '—'],
  ] : [];

  return (
    <Modal open title="Ficha de cliente" onClose={onClose}>
      {loading && <p className="text-sm text-[var(--panel-muted)]">Cargando…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && (
        <dl className="divide-y divide-[var(--line)] text-sm">
          {campos.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--acc)]">{label}</dt>
              <dd className="break-words whitespace-pre-wrap text-[var(--panel-text)]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}
