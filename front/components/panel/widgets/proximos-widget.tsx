'use client';
import { useEffect, useState } from 'react';
import { useTerm } from '@/lib/tenant-config-context';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seedCitas, type Cita } from '@/lib/mock/data';
import { dateStr } from '@/lib/utils/format';
import { WidgetShell } from './widget-shell';

const MAX_ITEMS = 5;

/** Próximas N citas/entrenamientos a partir de hoy, ordenados por fecha+hora. */
export function ProximosWidget() {
  const termCitas = useTerm('citas', 'Citas');
  const { items } = useCollection<Cita>('citas', seedCitas);
  const [hoy, setHoy] = useState('');

  useEffect(() => {
    const d = new Date();
    setHoy(dateStr(d.getFullYear(), d.getMonth(), d.getDate()));
  }, []);

  const proximas = hoy
    ? items
        .filter((c) => c.estado !== 'Cancelada' && c.fecha >= hoy)
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
        .slice(0, MAX_ITEMS)
    : [];

  return (
    <WidgetShell icon="ListOrdered" label={`Próximas ${termCitas.toLowerCase()}`}>
      {!hoy ? null : proximas.length === 0 ? (
        <p className="text-xs text-[var(--panel-muted)]">Sin {termCitas.toLowerCase()} próximas.</p>
      ) : (
        <ul className="space-y-1.5">
          {proximas.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-xs">
              <span className="truncate text-white">{c.cliente}</span>
              <span className="shrink-0 text-[var(--panel-muted)]">{c.fecha.slice(5)} · {c.hora}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
