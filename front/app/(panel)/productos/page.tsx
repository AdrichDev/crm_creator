'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { productos as seed, type Producto } from '@/lib/mock/data';
import { PackagePlus } from 'lucide-react';

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
  const { items, create, update, remove } = useCollection<Producto>('productos', seed);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Producto>); else create(v as unknown as Omit<Producto, 'id'>);
    setOpen(false);
  }

  return (
    <ModuleGuard module="productos">
      <PageHeader title={term} subtitle="Inventario: stock, categorías y proveedores."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><PackagePlus className="h-4 w-4" /> Nuevo</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Referencias" value={items.length} />
        <Stat label="Stock bajo" value={items.filter(p => Number(p.stock) < Number(p.minimo)).length} hint="por debajo del mínimo" />
        <Stat label="Valor stock" value={'€' + items.reduce((a, p) => a + Number(p.stock) * Number(p.precio), 0).toFixed(0)} />
      </div>
      <Table head={['Producto', 'Categoría', 'Stock', 'Mínimo', 'Precio', 'Proveedor', '']}>
        {items.map((p) => (
          <tr key={p.id} className="hover:bg-gray-50">
            <Td className="font-medium text-gray-900">{p.nombre}</Td>
            <Td><Badge>{p.categoria}</Badge></Td>
            <Td><span className={Number(p.stock) < Number(p.minimo) ? 'font-semibold text-red-600' : ''}>{p.stock}</span></Td>
            <Td>{p.minimo}</Td><Td>€{p.precio}</Td><Td>{p.proveedor}</Td>
            <Td><RowActions onEdit={() => { setEditing(p); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(p.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title={editing ? 'Editar producto' : 'Nuevo producto'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
