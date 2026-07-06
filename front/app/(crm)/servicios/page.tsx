'use client';
import { useMemo, useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useTenantConfig } from '@/lib/tenant-config-context';
import { serviciosMock } from '@/lib/config/sector-data';
import { PageHeader, Stat, Table, Td, Button, IconButton, type TableHeadCell } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { type Servicio } from '@/lib/mock/data';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { isApiEnabled } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { ImageCell } from '@/components/ui/image-cell';
import { cn } from '@/lib/utils';
import { sortServicios, type ServicioSortKey } from '@/lib/servicios/sort';

// Paleta de colores por categoría (crm-servicios-categoria-color): la categoría es texto
// libre por vertical (Pelo, Barba, Consulta, Civil, Penal...), sin enum fijo. Se asigna un
// color de forma DETERMINISTA por hash del string: la misma categoría siempre pinta igual,
// y categorías distintas se reparten entre la paleta (módulo del hash).
const CATEGORIA_COLORS = [
  'bg-blue-500/20 text-blue-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400',
  'bg-purple-500/20 text-purple-400',
  'bg-pink-500/20 text-pink-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-orange-500/20 text-orange-400',
  'bg-lime-500/20 text-lime-400',
];
function categoriaColor(categoria: string): string {
  let hash = 0;
  for (let i = 0; i < categoria.length; i++) hash = (hash * 31 + categoria.charCodeAt(i)) | 0;
  return CATEGORIA_COLORS[Math.abs(hash) % CATEGORIA_COLORS.length];
}
function CategoriaBadge({ categoria }: { categoria: string }) {
  return (
    <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', categoriaColor(categoria))}>
      {categoria}
    </span>
  );
}


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

  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [imgOverrides, setImgOverrides] = useState<Record<string, string>>({});

  // Ordenación por cabecera (servicio/categoría/duración/precio). Client-side sobre la
  // página ya cargada — el catálogo es corto (decenas de filas), no requiere sort server-side.
  const [sortKey, setSortKey] = useState<'' | ServicioSortKey>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  function onSort(key: string) {
    if (sortKey === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key as ServicioSortKey);
    setSortDir('asc');
  }

  // Items de visualización.
  const rawItems = (apiEnabled ? paged.items : collectionItems) as unknown as Servicio[];
  const displayItems = useMemo(
    () => (sortKey ? sortServicios(rawItems, sortKey, sortDir) : rawItems),
    [rawItems, sortKey, sortDir],
  );

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
        <Stat label="Precio medio" value={avg(s => Number(s.precio)) + ' €'} />
        <Stat label="Duración media" value={avg(s => Number(s.duracion)) + ' min'} />
      </div>

      {apiEnabled && (
        <div className="mb-4">
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar servicio..." />
        </div>
      )}

      <Table
        head={[
          { label: 'Servicio', sortKey: 'nombre' },
          { label: 'Categoría', sortKey: 'categoria' },
          { label: 'Duración', sortKey: 'duracion' },
          { label: 'Precio', sortKey: 'precio' },
          '',
        ] as TableHeadCell[]}
        sort={{ key: sortKey, dir: sortDir, onSort }}
      >
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
            <Td><CategoriaBadge categoria={s.categoria} /></Td><Td>{s.duracion} min</Td><Td>{s.precio} €</Td>
            <Td>
              <div className="flex items-center justify-end gap-2">
                <IconButton tone="edit" title="Editar" ariaLabel="Editar" onClick={() => { setEditing(s); setOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton tone="delete" title="Eliminar" ariaLabel="Eliminar"
                  onClick={() => { void dialog.confirm({ message: '¿Eliminar?', danger: true }).then((ok) => { if (ok) remove(s.id); }); }}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </Td>
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
