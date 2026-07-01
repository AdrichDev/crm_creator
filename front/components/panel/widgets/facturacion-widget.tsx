'use client';
import { useCollection } from '@/lib/data/use-collection';
import { facturas as seedFacturas, type Factura } from '@/lib/mock/data';
import { eur } from '@/lib/utils/format';
import { WidgetShell } from './widget-shell';

/** Facturas emitidas y aún no pagadas: importe y nº de documentos. */
export function FacturacionWidget() {
  const { items } = useCollection<Factura>('facturas', seedFacturas);

  const pendientes = items.filter((f) => f.estado !== 'Pagada');
  const total = pendientes.reduce((s, f) => s + (f.total ?? 0), 0);

  return (
    <WidgetShell icon="Euro" label="Facturación pendiente">
      <p className="text-2xl font-bold text-white">{eur(total)}</p>
      <p className="text-[11px] text-[var(--panel-muted)]">
        {pendientes.length} factura{pendientes.length === 1 ? '' : 's'} sin cobrar
      </p>
    </WidgetShell>
  );
}
