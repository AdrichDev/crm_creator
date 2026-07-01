'use client';
import { useTerm } from '@/lib/tenant-config-context';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seedCitas, type Cita } from '@/lib/mock/data';
import { WidgetShell } from './widget-shell';

/** Resumen de citas: total / confirmadas / pendientes. */
export function KpisWidget() {
  const termCitas = useTerm('citas', 'Citas');
  const { items } = useCollection<Cita>('citas', seedCitas);

  const total = items.length;
  const confirmadas = items.filter((c) => c.estado === 'Confirmada').length;
  const pendientes = items.filter((c) => c.estado === 'Pendiente').length;

  return (
    <WidgetShell icon="Gauge" label={`Resumen · ${termCitas}`}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xl font-bold text-white">{total}</p>
          <p className="text-[11px] text-[var(--panel-muted)]">Totales</p>
        </div>
        <div>
          <p className="text-xl font-bold text-white">{confirmadas}</p>
          <p className="text-[11px] text-[var(--panel-muted)]">Confirmadas</p>
        </div>
        <div>
          <p className="text-xl font-bold text-white">{pendientes}</p>
          <p className="text-[11px] text-[var(--panel-muted)]">Pendientes</p>
        </div>
      </div>
    </WidgetShell>
  );
}
