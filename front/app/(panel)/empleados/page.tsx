'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { empleados as seed, type Empleado } from '@/lib/mock/data';
import { UserPlus } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'rol', label: 'Rol' },
  { name: 'especialidad', label: 'Especialidad' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Vacaciones', 'Baja'] },
];

export default function Page() {
  const term = useTerm('empleados', 'Empleados');
  const { items, create, update, remove } = useCollection<Empleado>('empleados', seed);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Empleado | null>(null);

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Empleado>); else create(v as unknown as Omit<Empleado, 'id'>);
    setOpen(false);
  }

  return (
    <ModuleGuard module="empleados">
      <PageHeader title={term} subtitle="Plantilla, roles y especialidades."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><UserPlus className="h-4 w-4" /> Añadir</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Plantilla" value={items.length} />
        <Stat label="Activos" value={items.filter(e => e.estado === 'Activo').length} />
        <Stat label="De vacaciones" value={items.filter(e => e.estado === 'Vacaciones').length} />
      </div>
      <Table head={['Nombre', 'Rol', 'Especialidad', 'Email', 'Estado', '']}>
        {items.map((e) => (
          <tr key={e.id} className="hover:bg-gray-50">
            <Td className="font-medium text-gray-900">{e.nombre}</Td>
            <Td>{e.rol}</Td><Td>{e.especialidad}</Td><Td>{e.email}</Td>
            <Td><Badge tone={e.estado === 'Activo' ? 'green' : 'amber'}>{e.estado}</Badge></Td>
            <Td><RowActions onEdit={() => { setEditing(e); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(e.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title={editing ? 'Editar empleado' : 'Nuevo empleado'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
