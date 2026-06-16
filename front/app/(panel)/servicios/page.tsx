'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { servicios as seed, type Servicio } from '@/lib/mock/data';
import { Plus } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'categoria', label: 'Categoría' },
  { name: 'duracion', label: 'Duración (min)', type: 'number' },
  { name: 'precio', label: 'Precio (€)', type: 'number', step: '0.01' },
];

export default function Page() {
  const term = useTerm('servicios', 'Servicios');
  const { items, create, update, remove } = useCollection<Servicio>('servicios', seed);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Servicio>); else create(v as unknown as Omit<Servicio, 'id'>);
    setOpen(false);
  }
  const avg = (sel: (s: Servicio) => number) => items.length ? Math.round(items.reduce((a, s) => a + sel(s), 0) / items.length) : 0;

  return (
    <ModuleGuard module="servicios">
      <PageHeader title={term} subtitle="Catálogo: duración y precio."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Añadir</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Servicios" value={items.length} />
        <Stat label="Precio medio" value={'€' + avg(s => Number(s.precio))} />
        <Stat label="Duración media" value={avg(s => Number(s.duracion)) + ' min'} />
      </div>
      <Table head={['Servicio', 'Categoría', 'Duración', 'Precio', '']}>
        {items.map((s) => (
          <tr key={s.id}>
            <Td className="font-medium text-gray-900">{s.nombre}</Td>
            <Td><Badge>{s.categoria}</Badge></Td><Td>{s.duracion} min</Td><Td>€{s.precio}</Td>
            <Td><RowActions onEdit={() => { setEditing(s); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(s.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title={editing ? 'Editar servicio' : 'Nuevo servicio'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
