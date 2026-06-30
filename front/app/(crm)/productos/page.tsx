'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { productos as seed, type Producto } from '@/lib/mock/data';
import { PackagePlus } from 'lucide-react';
import { isApiEnabled } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { ImageCell } from '@/components/ui/image-cell';

// Shape que devuelve el back para /products paginado (crudRouter).
type ProductoApiRow = {
  id: string;
  nombre: string;
  categoria: string;
  stock: number;
  minimo: number;
  precio: number;
  proveedor: string;
  imagenUrl?: string | null;
};

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'categoria', label: 'Categoría' },
  { name: 'stock', label: 'Stock', type: 'number' },
  { name: 'minimo', label: 'Stock mínimo', type: 'number' },
  { name: 'precio', label: 'Precio (€)', type: 'number', step: '0.01' },
  { name: 'proveedor', label: 'Proveedor' },
];

export default function Page() {
  const term = useTerm('productos', 'Productos');
  const apiEnabled = isApiEnabled();

  // Modo generador: localStorage / mock.
  const { items: collectionItems, create, update, remove } = useCollection<Producto>('productos', seed);

  // Modo API: paginación server-side.
  const paged = usePaginatedApi<ProductoApiRow>('/products', 20, apiEnabled);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const [imgOverrides, setImgOverrides] = useState<Record<string, string>>({});

  // Items de visualización.
  const displayItems = (apiEnabled ? paged.items : collectionItems) as unknown as Producto[];

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Producto>); else create(v as unknown as Omit<Producto, 'id'>);
    setOpen(false);
    if (apiEnabled) paged.refresh();
  }

  const bajoStock = displayItems.filter((p) => Number(p.stock) < Number(p.minimo));

  return (
    <ModuleGuard module="productos">
      <PageHeader title={term} subtitle="Inventario: stock, categorías y proveedores."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><PackagePlus className="h-4 w-4" /> Nuevo</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Referencias" value={apiEnabled ? paged.total : displayItems.length} />
        <Stat label="Stock bajo" value={displayItems.filter(p => Number(p.stock) < Number(p.minimo)).length} hint="por debajo del mínimo" />
        <Stat label="Valor stock" value={'€' + displayItems.reduce((a, p) => a + Number(p.stock) * Number(p.precio), 0).toFixed(0)} />
      </div>
      {bajoStock.length > 0 && (
        <div className="low-stock-alert">
          <strong>Alerta de stock:</strong> {bajoStock.length} producto(s) por debajo del mínimo — {bajoStock.map((p) => p.nombre).join(', ')}.
        </div>
      )}

      {apiEnabled && (
        <div className="mb-4">
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar producto..." />
        </div>
      )}

      <Table head={['Producto', 'Categoría', 'Stock', 'Mínimo', 'Precio', 'Proveedor', '']}>
        {displayItems.map((p) => (
          <tr key={p.id}>
            <Td className="font-medium text-[var(--panel-text)]">
              <div className="flex items-center gap-3">
                <ImageCell
                  kind="product"
                  id={String(p.id)}
                  imagenUrl={imgOverrides[String(p.id)] ?? (p as unknown as { imagenUrl?: string | null }).imagenUrl}
                  enabled={apiEnabled}
                  onUploaded={(url) => setImgOverrides((m) => ({ ...m, [String(p.id)]: url }))}
                />
                <span>{p.nombre}</span>
              </div>
            </Td>
            <Td><Badge>{p.categoria}</Badge></Td>
            <Td><span className={Number(p.stock) < Number(p.minimo) ? 'font-semibold text-red-600' : ''}>{p.stock}</span></Td>
            <Td>{p.minimo}</Td><Td>€{p.precio}</Td><Td>{p.proveedor}</Td>
            <Td><RowActions onEdit={() => { setEditing(p); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(p.id); }} /></Td>
          </tr>
        ))}
      </Table>

      {apiEnabled && (
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} limit={paged.limit} onChange={paged.setPage} />
      )}

      <EntityModal open={open} title={editing ? 'Editar producto' : 'Nuevo producto'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
