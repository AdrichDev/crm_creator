'use client';
import { useEffect, useState } from 'react';
import { useCollection } from '@/lib/data/use-collection';
import { ventas as seedVentas, type Venta } from '@/lib/mock/data';
import { dateStr, eur } from '@/lib/utils/format';
import { WidgetShell } from './widget-shell';

/** Total vendido hoy (todo el negocio, no solo el trabajador). */
export function VentasHoyWidget() {
  const { items } = useCollection<Venta>('ventas', seedVentas);
  const [hoy, setHoy] = useState('');

  useEffect(() => {
    const d = new Date();
    setHoy(dateStr(d.getFullYear(), d.getMonth(), d.getDate()));
  }, []);

  const ventasHoy = items.filter((v) => v.fecha === hoy);
  const total = ventasHoy.reduce((s, v) => s + (v.total ?? 0), 0);

  return (
    <WidgetShell icon="Receipt" label="Ventas de hoy">
      <p className="text-2xl font-bold text-white">{eur(total)}</p>
      <p className="text-[11px] text-[var(--panel-muted)]">{ventasHoy.length} ticket{ventasHoy.length === 1 ? '' : 's'}</p>
    </WidgetShell>
  );
}
