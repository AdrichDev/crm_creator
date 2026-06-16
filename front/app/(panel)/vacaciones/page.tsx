'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canManage } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Td, Badge, Button } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { vacaciones as seed, type Vacacion } from '@/lib/mock/data';
import { Plus } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'empleado', label: 'Empleado', required: true },
  { name: 'tipo', label: 'Tipo', type: 'select', options: ['Vacaciones', 'Asuntos propios', 'Baja'] },
  { name: 'inicio', label: 'Inicio', type: 'date', required: true },
  { name: 'fin', label: 'Fin', type: 'date', required: true },
  { name: 'dias', label: 'Días', type: 'number' },
];

export default function Page() {
  const term = useTerm('vacaciones', 'Vacaciones');
  const { role } = useRole();
  const gestiona = canManage(role); // solo admin aprueba/rechaza/elimina
  const { items, create, update, remove } = useCollection<Vacacion>('vacaciones', seed);
  const [open, setOpen] = useState(false);
  const tone = (s: string) => s === 'Aprobada' ? 'green' : s === 'Pendiente' ? 'amber' : 'red';

  function onSubmit(v: Record<string, string | number>) {
    create({ estado: 'Pendiente', tipo: 'Vacaciones', ...v } as unknown as Omit<Vacacion, 'id'>);
    setOpen(false);
  }

  return (
    <ModuleGuard module="vacaciones">
      <PageHeader title={term} subtitle="Solicitudes y aprobación de ausencias."
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Solicitar</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Solicitudes" value={items.length} />
        <Stat label="Pendientes" value={items.filter(v => v.estado === 'Pendiente').length} />
        <Stat label="Días aprobados" value={items.filter(v => v.estado === 'Aprobada').reduce((a, v) => a + Number(v.dias), 0)} />
      </div>
      <Table head={['Empleado', 'Tipo', 'Inicio', 'Fin', 'Días', 'Estado', gestiona ? '' : null].filter((h) => h !== null) as string[]}>
        {items.map((v) => (
          <tr key={v.id}>
            <Td className="font-medium text-gray-900">{v.empleado}</Td>
            <Td>{v.tipo}</Td><Td>{v.inicio}</Td><Td>{v.fin}</Td><Td>{v.dias}</Td>
            <Td><Badge tone={tone(v.estado)}>{v.estado}</Badge></Td>
            {gestiona && (
              <Td>
                {v.estado === 'Pendiente' ? (
                  <div className="flex justify-end gap-1">
                    <button onClick={() => update(v.id, { estado: 'Aprobada' })} className="row-action approve">Aprobar</button>
                    <button onClick={() => update(v.id, { estado: 'Rechazada' })} className="row-action danger">Rechazar</button>
                  </div>
                ) : (
                  <div className="flex justify-end"><button onClick={() => { if (confirm('¿Eliminar?')) remove(v.id); }} className="row-action edit">Eliminar</button></div>
                )}
              </Td>
            )}
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title="Nueva solicitud" fields={FIELDS}
        initial={{ tipo: 'Vacaciones' }} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
