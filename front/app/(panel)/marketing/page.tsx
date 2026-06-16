'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { campanas as seed, type Campana } from '@/lib/mock/data';
import { Send } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'canal', label: 'Canal', type: 'select', options: ['Email', 'SMS', 'WhatsApp'] },
  { name: 'estado', label: 'Estado', type: 'select', options: ['Borrador', 'Activa', 'Automática', 'Finalizada'] },
  { name: 'enviados', label: 'Enviados', type: 'number' },
  { name: 'aperturas', label: 'Aperturas' },
];

export default function Page() {
  const term = useTerm('marketing', 'Marketing');
  const { items, create, update, remove } = useCollection<Campana>('marketing', seed);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campana | null>(null);
  const tone = (s: string) => s === 'Activa' ? 'green' : s === 'Automática' ? 'blue' : 'gray';

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Campana>); else create({ aperturas: '—', ...v } as unknown as Omit<Campana, 'id'>);
    setOpen(false);
  }

  return (
    <ModuleGuard module="marketing">
      <PageHeader title={term} subtitle="Campañas, fidelización y notificaciones a clientes."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Send className="h-4 w-4" /> Nueva campaña</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Campañas" value={items.length} />
        <Stat label="Activas" value={items.filter(c => c.estado === 'Activa').length} />
        <Stat label="Envíos" value={items.reduce((a, c) => a + Number(c.enviados), 0)} />
      </div>
      <Table head={['Campaña', 'Canal', 'Estado', 'Enviados', 'Aperturas', '']}>
        {items.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium text-gray-900">{c.nombre}</Td>
            <Td><Badge>{c.canal}</Badge></Td>
            <Td><Badge tone={tone(c.estado)}>{c.estado}</Badge></Td>
            <Td>{c.enviados}</Td><Td>{c.aperturas}</Td>
            <Td><RowActions onEdit={() => { setEditing(c); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(c.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title={editing ? 'Editar campaña' : 'Nueva campaña'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
