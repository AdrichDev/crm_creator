'use client';
import { useCollection } from '@/lib/data/use-collection';
import { vacaciones as seedVacaciones, type Vacacion } from '@/lib/mock/data';
import { WidgetShell } from './widget-shell';

/** Solicitudes de ausencia a la espera de aprobación. */
export function VacacionesWidget() {
  const { items } = useCollection<Vacacion>('vacaciones', seedVacaciones);

  const pendientes = items.filter((v) => v.estado === 'Pendiente');

  return (
    <WidgetShell icon="Plane" label="Ausencias pendientes">
      {pendientes.length === 0 ? (
        <p className="text-xs text-[var(--panel-muted)]">Sin solicitudes pendientes.</p>
      ) : (
        <ul className="space-y-1.5">
          {pendientes.map((v) => (
            <li key={v.id} className="truncate text-xs text-white">
              {v.empleado} <span className="text-[var(--panel-muted)]">· {v.dias}d</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
