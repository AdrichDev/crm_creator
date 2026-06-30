'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Badge, Button } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { empleados as seed, type Empleado } from '@/lib/mock/data';
import { UserPlus } from 'lucide-react';
import { isApiEnabled } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';

// Shape que devuelve el back para /employees paginado.
type EmpleadoApiRow = {
  id: string;
  nombre: string;
  rol: string;
  especialidad: string;
  email: string;
  telefono: string;
  estado: string;
  color: string;
};

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'rol', label: 'Rol' },
  { name: 'especialidad', label: 'Especialidad' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Vacaciones', 'Baja'] },
];

const iniciales = (n: string) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function Page() {
  const term = useTerm('empleados', 'Empleados');
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'empleados');
  const apiEnabled = isApiEnabled();

  // Modo generador: localStorage / mock.
  const { items: collectionItems, create, update, remove } = useCollection<Empleado>('empleados', seed);

  // Modo API: paginación server-side.
  const paged = usePaginatedApi<EmpleadoApiRow>('/employees', 20, apiEnabled);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Empleado | null>(null);

  // Items de visualización.
  const displayItems = (apiEnabled ? paged.items : collectionItems) as unknown as Empleado[];

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Empleado>); else create(v as unknown as Omit<Empleado, 'id'>);
    setOpen(false);
    if (apiEnabled) paged.refresh();
  }

  return (
    <ModuleGuard module="empleados">
      <PageHeader title={term} subtitle="Plantilla, roles y especialidades."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><UserPlus className="h-4 w-4" /> Añadir</Button>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Plantilla" value={apiEnabled ? paged.total : displayItems.length} accent />
        <Stat label="Activos" value={displayItems.filter((e) => e.estado === 'Activo').length} />
        <Stat label="De vacaciones" value={displayItems.filter((e) => e.estado === 'Vacaciones').length} />
      </div>

      {apiEnabled && (
        <div className="mb-4">
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar empleado..." />
        </div>
      )}

      <div className="equipo-grid">
        {displayItems.map((e) => (
          <div key={e.id} className="equipo-card">
            <div className="equipo-avatar">{iniciales(e.nombre)}</div>
            <h3>{e.nombre}</h3>
            <p className="role">{e.rol || '—'}</p>
            <p className="spec">{e.especialidad}</p>
            <div className="mb-4"><Badge tone={e.estado === 'Activo' ? 'green' : 'amber'}>{e.estado}</Badge></div>
            {puedeEditar && (
              <div className="equipo-actions">
                <button className="btn btn-outline btn-sm" onClick={() => { setEditing(e); setOpen(true); }}>Editar</button>
                <button className="btn btn-outline btn-sm" onClick={() => { if (confirm('¿Eliminar miembro?')) remove(e.id); }}>Eliminar</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {apiEnabled && (
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} limit={paged.limit} onChange={paged.setPage} />
      )}

      <EntityModal open={open} title={editing ? 'Editar miembro' : 'Nuevo miembro del equipo'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
