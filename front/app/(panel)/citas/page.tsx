'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seed, type Cita } from '@/lib/mock/data';
import { CalendarPlus } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'cliente', label: 'Cliente', required: true },
  { name: 'servicio', label: 'Servicio' },
  { name: 'empleado', label: 'Profesional' },
  { name: 'fecha', label: 'Fecha', type: 'date', required: true },
  { name: 'hora', label: 'Hora', type: 'time' },
  { name: 'estado', label: 'Estado', type: 'select', options: ['Pendiente', 'Confirmada', 'Cancelada', 'Completada'] },
];

export default function Page() {
  const term = useTerm('citas', 'Citas');
  const { items, create, update, remove } = useCollection<Cita>('citas', seed);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cita | null>(null);
  const tone = (s: string) => s === 'Confirmada' ? 'green' : s === 'Pendiente' ? 'amber' : s === 'Completada' ? 'blue' : 'red';

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Cita>); else create(v as unknown as Omit<Cita, 'id'>);
    setOpen(false);
  }

  return (
    <ModuleGuard module="citas">
      <PageHeader title={term} subtitle="Agenda y reservas con estados."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><CalendarPlus className="h-4 w-4" /> Nueva</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={items.length} />
        <Stat label="Confirmadas" value={items.filter(c => c.estado === 'Confirmada').length} />
        <Stat label="Pendientes" value={items.filter(c => c.estado === 'Pendiente').length} />
      </div>
      <Table head={['Cliente', 'Servicio', 'Profesional', 'Fecha', 'Hora', 'Estado', '']}>
        {items.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium text-gray-900">{c.cliente}</Td>
            <Td>{c.servicio}</Td><Td>{c.empleado}</Td><Td>{c.fecha}</Td><Td>{c.hora}</Td>
            <Td><Badge tone={tone(c.estado)}>{c.estado}</Badge></Td>
            <Td><RowActions onEdit={() => { setEditing(c); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(c.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title={editing ? 'Editar cita' : 'Nueva cita'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
