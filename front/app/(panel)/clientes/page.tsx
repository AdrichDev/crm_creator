'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { clientes as seed, type Cliente } from '@/lib/mock/data';
import { UserPlus } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'telefono', label: 'Teléfono' },
  { name: 'segmento', label: 'Segmento', type: 'select', options: ['Nuevo', 'Recurrente', 'VIP'] },
  { name: 'visitas', label: 'Visitas', type: 'number' },
  { name: 'gastoTotal', label: 'Gasto total (€)', type: 'number', step: '0.01' },
  { name: 'ultimaVisita', label: 'Última visita', type: 'date' },
];

export default function Page() {
  const term = useTerm('clientes', 'Clientes');
  const { items, create, update, remove } = useCollection<Cliente>('clientes', seed);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const tone = (s: string) => s === 'VIP' ? 'brand' : s === 'Nuevo' ? 'blue' : 'gray';

  function onNew() { setEditing(null); setOpen(true); }
  function onEdit(c: Cliente) { setEditing(c); setOpen(true); }
  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Cliente>);
    else create(v as unknown as Omit<Cliente, 'id'>);
    setOpen(false);
  }

  return (
    <ModuleGuard module="clientes">
      <PageHeader title={term} subtitle="CRM: fichas, historial y segmentos."
        action={<Button onClick={onNew}><UserPlus className="h-4 w-4" /> Nuevo</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={items.length} />
        <Stat label="VIP" value={items.filter(c => c.segmento === 'VIP').length} />
        <Stat label="Gasto medio" value={'€' + (items.length ? Math.round(items.reduce((a, c) => a + Number(c.gastoTotal), 0) / items.length) : 0)} />
      </div>
      <Table head={['Nombre', 'Contacto', 'Visitas', 'Gasto', 'Segmento', 'Última visita', '']}>
        {items.map((c) => (
          <tr key={c.id} className="hover:bg-gray-50">
            <Td className="font-medium text-gray-900">{c.nombre}</Td>
            <Td><div>{c.email}</div><div className="text-xs text-gray-400">{c.telefono}</div></Td>
            <Td>{c.visitas}</Td><Td>€{c.gastoTotal}</Td>
            <Td><Badge tone={tone(c.segmento)}>{c.segmento}</Badge></Td>
            <Td>{c.ultimaVisita}</Td>
            <Td><RowActions onEdit={() => onEdit(c)} onDelete={() => { if (confirm('¿Eliminar cliente?')) remove(c.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title={editing ? 'Editar cliente' : 'Nuevo cliente'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
