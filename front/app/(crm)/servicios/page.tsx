'use client';
import { useMemo, useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useTenantConfig } from '@/lib/tenant-config-context';
import { serviciosMock } from '@/lib/config/sector-data';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { type Servicio } from '@/lib/mock/data';
import { Plus } from 'lucide-react';
import { isApiEnabled } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { ImageCell } from '@/components/ui/image-cell';

// Shape que devuelve el back para /services paginado (crudRouter).
type ServicioApiRow = {
  id: string;
  nombre: string;
  categoria: string;
  duracion: number;
  precio: number;
  imagenUrl?: string | null;
};

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'categoria', label: 'Categoría' },
  { name: 'duracion', label: 'Duración (min)', type: 'number' },
  { name: 'precio', label: 'Precio (€)', type: 'number', step: '0.01' },
];

export default function Page() {
  const term = useTerm('servicios', 'Servicios');
  const { config } = useTenantConfig();
  const seed = useMemo(() => serviciosMock(config.business.vertical), [config.business.vertical]);
  const apiEnabled = isApiEnabled();

  // Modo generador: localStorage / mock.
  const { items: collectionItems, create, update, remove } = useCollection<Servicio>('servicios', seed);

  // Modo API: paginación server-side.
  const paged = usePaginatedApi<ServicioApiRow>('/services', 20, apiEnabled);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [imgOverrides, setImgOverrides] = useState<Record<string, string>>({});

  // Items de visualización.
  const displayItems = (apiEnabled ? paged.items : collectionItems) as unknown as Servicio[];

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Servicio>); else create(v as unknown as Omit<Servicio, 'id'>);
    setOpen(false);
    if (apiEnabled) paged.refresh();
  }
  const avg = (sel: (s: Servicio) => number) => displayItems.length ? Math.round(displayItems.reduce((a, s) => a + sel(s), 0) / displayItems.length) : 0;

  return (
    <ModuleGuard module="servicios">
      <PageHeader title={term} subtitle="Catálogo: duración y precio."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Añadir</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Servicios" value={apiEnabled ? paged.total : displayItems.length} />
        <Stat label="Precio medio" value={'€' + avg(s => Number(s.precio))} />
        <Stat label="Duración media" value={avg(s => Number(s.duracion)) + ' min'} />
      </div>

      {apiEnabled && (
        <div className="mb-4">
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar servicio..." />
        </div>
      )}

      <Table head={['Servicio', 'Categoría', 'Duración', 'Precio', '']}>
        {displayItems.map((s) => (
          <tr key={s.id}>
            <Td className="font-medium text-[var(--panel-text)]">
              <div className="flex items-center gap-3">
                <ImageCell
                  kind="service"
                  id={String(s.id)}
                  imagenUrl={imgOverrides[String(s.id)] ?? (s as unknown as { imagenUrl?: string | null }).imagenUrl}
                  enabled={apiEnabled}
                  onUploaded={(url) => setImgOverrides((m) => ({ ...m, [String(s.id)]: url }))}
                />
                <span>{s.nombre}</span>
              </div>
            </Td>
            <Td><Badge>{s.categoria}</Badge></Td><Td>{s.duracion} min</Td><Td>€{s.precio}</Td>
            <Td><RowActions onEdit={() => { setEditing(s); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(s.id); }} /></Td>
          </tr>
        ))}
      </Table>

      {apiEnabled && (
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} limit={paged.limit} onChange={paged.setPage} />
      )}

      <EntityModal open={open} title={editing ? 'Editar servicio' : 'Nuevo servicio'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
