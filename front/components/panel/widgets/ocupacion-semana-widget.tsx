'use client';
import { useEffect, useState } from 'react';
import { useTerm } from '@/lib/tenant-config-context';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seedCitas, type Cita } from '@/lib/mock/data';
import { buildWeekCells } from '@/lib/utils/calendar';
import { DOW } from '@/lib/config/constants';
import { WidgetShell } from './widget-shell';

/** Mini gráfico de barras: nº de citas/eventos por día de la semana en curso. */
export function OcupacionSemanaWidget() {
  const termCitas = useTerm('citas', 'Citas');
  const { items } = useCollection<Cita>('citas', seedCitas);
  const [semana, setSemana] = useState<{ d: number; date: string }[] | null>(null);

  useEffect(() => {
    setSemana(buildWeekCells(new Date()));
  }, []);

  if (!semana) return null;

  const porDia = semana.map((cell) => items.filter((c) => c.fecha === cell.date).length);
  const max = Math.max(1, ...porDia);

  return (
    <WidgetShell icon="BarChart3" label={`Ocupación semanal · ${termCitas.toLowerCase()}`}>
      <div className="flex h-16 items-end gap-1.5">
        {porDia.map((n, i) => (
          <div key={semana[i].date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-[var(--acc)]"
              style={{ height: `${Math.max(6, (n / max) * 100)}%`, opacity: n === 0 ? 0.15 : 1 }}
              title={`${n} ${termCitas.toLowerCase()}`}
            />
            <span className="text-[10px] text-[var(--panel-muted)]">{DOW[i]}</span>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}
