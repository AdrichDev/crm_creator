'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { ventas as seed, type Venta } from '@/lib/mock/data';
import { ShoppingCart } from 'lucide-react';

const today = new Date().toISOString().slice(0, 10);
const FIELDS: Field[] = [
  { name: 'cliente', label: 'Cliente', placeholder: 'Contado' },
  { name: 'fecha', label: 'Fecha', type: 'date', required: true },
  { name: 'items', label: 'Artículos', type: 'number' },
  { name: 'metodo', label: 'Método de pago', type: 'select', options: ['Tarjeta', 'Efectivo', 'Bizum'] },
  { name: 'total', label: 'Total (€)', type: 'number', step: '0.01', required: true },
];

export default function Page() {
  const term = useTerm('ventas', 'Ventas / TPV');
  const { items, create, remove } = useCollection<Venta>('ventas', seed);
  const [open, setOpen] = useState(false);
  const total = items.reduce((a, v) => a + Number(v.total), 0);
  const tone = (m: string) => m === 'Tarjeta' ? 'blue' : m === 'Efectivo' ? 'green' : 'brand';

  function onSubmit(v: Record<string, string | number>) {
    create({ cliente: 'Contado', items: 1, ...v } as unknown as Omit<Venta, 'id'>);
    setOpen(false);
  }

  return (
    <ModuleGuard module="ventas">
      <PageHeader title={term} subtitle="Tickets, métodos de pago y caja."
        action={<Button onClick={() => setOpen(true)}><ShoppingCart className="h-4 w-4" /> Nuevo ticket</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Tickets" value={items.length} />
        <Stat label="Facturación" value={'€' + total.toFixed(2)} />
        <Stat label="Ticket medio" value={'€' + (items.length ? (total / items.length).toFixed(2) : '0.00')} />
      </div>
      <Table head={['Ticket', 'Fecha', 'Cliente', 'Artículos', 'Método', 'Total', '']}>
        {items.map((v) => (
          <tr key={v.id} className="hover:bg-gray-50">
            <Td className="font-medium text-gray-900">#{v.id}</Td>
            <Td>{v.fecha}</Td><Td>{v.cliente}</Td><Td>{v.items}</Td>
            <Td><Badge tone={tone(v.metodo)}>{v.metodo}</Badge></Td>
            <Td className="font-medium">€{Number(v.total).toFixed(2)}</Td>
            <Td><RowActions onDelete={() => { if (confirm('¿Anular ticket?')) remove(v.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title="Nuevo ticket" fields={FIELDS}
        initial={{ fecha: today, metodo: 'Tarjeta' }} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
