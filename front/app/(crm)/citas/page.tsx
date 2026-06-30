'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seed, type Cita } from '@/lib/mock/data';
import { isApiEnabled } from '@/lib/api/client';
import { NuevaCitaModal } from '@/components/crm/nueva-cita-modal';
import { CalendarPlus } from 'lucide-react';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';

// Shape que devuelve el back para /bookings paginado.
type CitaApiRow = {
  id: string;
  cliente: string;
  servicio: string;
  empleado: string;
  fecha: string;
  hora: string;
  estado: string;
  customerId: string | null;
  serviceId: string | null;
  employeeId: string | null;
  locationId: string | null;
};

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
  const apiEnabled = isApiEnabled();

  // Modo generador: localStorage / mock.
  const { items: collectionItems, create, update, remove, refresh: collectionRefresh } = useCollection<Cita>('citas', seed);

  // Modo API: paginación server-side.
  const paged = usePaginatedApi<CitaApiRow>('/bookings', 20, apiEnabled);

  const [open, setOpen] = useState(false);
  const [openNueva, setOpenNueva] = useState(false);
  const [editing, setEditing] = useState<Cita | null>(null);
  const tone = (s: string) => s === 'Confirmada' ? 'green' : s === 'Pendiente' ? 'amber' : s === 'Completada' ? 'blue' : 'red';

  // Items de visualización.
  const displayItems = (apiEnabled ? paged.items : collectionItems) as unknown as Cita[];

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Cita>); else create(v as unknown as Omit<Cita, 'id'>);
    setOpen(false);
    if (apiEnabled) paged.refresh();
  }
  // En modo CRM el alta es real (selectores por id + disponibilidad); en generador, el modal mock.
  function onNueva() { if (apiEnabled) setOpenNueva(true); else { setEditing(null); setOpen(true); } }

  return (
    <ModuleGuard module="citas">
      <PageHeader title={term} subtitle="Agenda y reservas con estados."
        action={<Button onClick={onNueva}><CalendarPlus className="h-4 w-4" /> Nueva</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={apiEnabled ? paged.total : displayItems.length} />
        <Stat label="Confirmadas" value={displayItems.filter(c => c.estado === 'Confirmada').length} />
        <Stat label="Pendientes" value={displayItems.filter(c => c.estado === 'Pendiente').length} />
      </div>

      {apiEnabled && (
        <div className="mb-4">
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar cita..." />
        </div>
      )}

      <Table head={['Cliente', 'Servicio', 'Profesional', 'Fecha', 'Hora', 'Estado', '']}>
        {displayItems.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium text-[var(--panel-text)]">{c.cliente}</Td>
            <Td>{c.servicio}</Td><Td>{c.empleado}</Td><Td>{c.fecha}</Td><Td>{c.hora}</Td>
            <Td><Badge tone={tone(c.estado)}>{c.estado}</Badge></Td>
            <Td><RowActions onEdit={() => { setEditing(c); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(c.id); }} /></Td>
          </tr>
        ))}
      </Table>

      {apiEnabled && (
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} limit={paged.limit} onChange={paged.setPage} />
      )}

      <EntityModal open={open} title={editing ? 'Editar cita' : 'Nueva cita'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
      <NuevaCitaModal open={openNueva} onClose={() => setOpenNueva(false)} onCreated={() => {
        void collectionRefresh();
        paged.refresh();
      }} />
    </ModuleGuard>
  );
}
