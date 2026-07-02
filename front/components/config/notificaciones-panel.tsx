'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { Table, Td, Badge } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';

interface Notif {
  id: string; tipo: string; canal: string; destino: string | null; estado: string;
  programadoEn: string | null; enviadoEn: string | null; createdAt: string;
}

const LIMIT = 20;
// Valores reales que escribe el back (reminderDrainer): pending/sent/failed/skipped.
const ESTADOS: Array<[string, string]> = [
  ['', 'Todos'], ['pending', 'Pendiente'], ['sent', 'Enviado'], ['failed', 'Fallido'], ['skipped', 'Omitido'],
];
const fmt = (s: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');
const tone = (e: string) => (e === 'sent' ? 'green' : e === 'failed' ? 'red' : e === 'skipped' ? 'gray' : 'amber');

// Historial de notificaciones del negocio (solo lectura). Las escribe el sistema
// (drainer de recordatorios); aquí solo se listan y filtran por estado.
export function NotificacionesPanel() {
  const [items, setItems] = useState<Notif[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (estado) params.set('estado', estado);
      const r = await apiFetch<{ items: Notif[]; total: number }>(`/notifications?${params.toString()}`);
      setItems(r.items ?? []); setTotal(r.total ?? 0);
    } catch { setItems([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, estado]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.ceil(total / LIMIT);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--panel-muted)]">Estado</label>
        <select className="opera-control w-auto" value={estado}
          onChange={(e) => { setEstado(e.target.value); setPage(1); }} aria-label="Filtrar por estado">
          {ESTADOS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      <Table head={['Tipo', 'Canal', 'Destino', 'Estado', 'Programado', 'Enviado']}>
        {items.map((n) => (
          <tr key={n.id}>
            <Td className="font-medium text-white">{n.tipo}</Td>
            <Td>{n.canal}</Td>
            <Td>{n.destino ?? '—'}</Td>
            <Td><Badge tone={tone(n.estado)}>{n.estado}</Badge></Td>
            <Td>{fmt(n.programadoEn)}</Td>
            <Td>{fmt(n.enviadoEn)}</Td>
          </tr>
        ))}
      </Table>
      {items.length === 0 && !loading && <p className="empty-state">No hay notificaciones.</p>}

      <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onChange={setPage} />
    </div>
  );
}
