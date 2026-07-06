'use client';
import { useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Td, Badge, RowActions } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import { ventas as seedVentas, type Venta, productos as seedProductos, type Producto } from '@/lib/mock/data';
import { isApiEnabled } from '@/lib/api/client';
import { LineasVentaModal } from '@/components/crm/lineas-venta-modal';
import { ListOrdered } from 'lucide-react';

const today = new Date().toISOString().slice(0, 10);
const tone = (m: string) => m === 'Tarjeta' ? 'blue' : m === 'Efectivo' ? 'green' : 'brand';

interface CartLine { id: number; nombre: string; precio: number; qty: number; }

export default function Page() {
  const term = useTerm('ventas', 'Ventas / TPV');
  const termProd = useTerm('productos', 'Productos');
  const { role } = useRole();
  const puedeCobrar = canWrite(role, 'ventas');
  const dialog = useDialog();
  const apiEnabled = isApiEnabled();
  const { items, create, remove, refresh } = useCollection<Venta>('ventas', seedVentas);
  const { items: productos } = useCollection<Producto>('productos', seedProductos);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [metodo, setMetodo] = useState('Tarjeta');
  const [lineasVenta, setLineasVenta] = useState<Venta | null>(null);

  const total = cart.reduce((a, l) => a + l.precio * l.qty, 0);
  const facturado = items.reduce((a, v) => a + Number(v.total), 0);

  function add(p: Producto) {
    setCart((prev) => {
      const found = prev.find((l) => l.id === p.id);
      if (found) return prev.map((l) => l.id === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { id: p.id, nombre: p.nombre, precio: Number(p.precio), qty: 1 }];
    });
  }
  function dec(id: number) {
    setCart((prev) => prev.flatMap((l) => l.id === id ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l]));
  }
  function vaciar() { setCart([]); }
  function cobrar() {
    if (cart.length === 0) return;
    const numItems = cart.reduce((a, l) => a + l.qty, 0);
    create({ fecha: today, cliente: 'Contado', items: numItems, metodo, total: Number(total.toFixed(2)) } as unknown as Omit<Venta, 'id'>);
    setCart([]);
  }

  return (
    <ModuleGuard module="ventas">
      <PageHeader title={term} subtitle="Venta directa (TPV), métodos de pago y caja." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Tickets" value={items.length} accent />
        <Stat label="Facturación" value={facturado.toFixed(2) + ' €'} />
        <Stat label="Ticket medio" value={(items.length ? (facturado / items.length).toFixed(2) : '0.00') + ' €'} />
      </div>

      {puedeCobrar && (
        <div className="tpv-layout mb-6">
          {/* Catálogo de productos */}
          <div className="panel">
            <div className="panel-header"><h2>Venta directa</h2><span className="subtitle">Pulsa un producto para añadirlo al ticket</span></div>
            <div className="tpv-product-grid">
              {productos.map((p) => (
                <button key={p.id} type="button" className="tpv-product" onClick={() => add(p)}>
                  <div className="name">{p.nombre}</div>
                  <div className="price">{Number(p.precio).toFixed(2)} €</div>
                </button>
              ))}
              {productos.length === 0 && <p className="empty-state">No hay {termProd.toLowerCase()} en catálogo.</p>}
            </div>
          </div>

          {/* Ticket */}
          <div className="panel tpv-panel">
            <div className="panel-header">
              <h2>Ticket</h2>
              <button className="btn btn-outline btn-sm" onClick={vaciar}>Vaciar</button>
            </div>
            <div className="tpv-cart">
              {cart.length === 0 ? <p className="tpv-empty">El ticket está vacío</p> : cart.map((l) => (
                <div key={l.id} className="tpv-cart-row">
                  <span>{l.nombre}</span>
                  <span className="flex items-center gap-2">
                    <button className="row-action edit" onClick={() => dec(l.id)}>−</button>
                    {l.qty} × {l.precio.toFixed(2)} €
                  </span>
                </div>
              ))}
            </div>
            <div className="tpv-total"><span>TOTAL</span><span>{total.toFixed(2)} €</span></div>
            <select className="tpv-select" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="Tarjeta">💳 Tarjeta</option>
              <option value="Efectivo">💵 Efectivo</option>
              <option value="Bizum">📲 Bizum</option>
            </select>
            <button className="btn btn-primary btn-block-lg" onClick={cobrar} disabled={cart.length === 0}>Finalizar cobro</button>
          </div>
        </div>
      )}

      <Table head={['Ticket', 'Fecha', 'Cliente', 'Artículos', 'Método', 'Total', '']}>
        {items.map((v) => (
          <tr key={v.id}>
            <Td className="font-medium text-white">#{v.id}</Td>
            <Td>{v.fecha}</Td><Td>{v.cliente}</Td><Td>{v.items}</Td>
            <Td><Badge tone={tone(v.metodo)}>{v.metodo}</Badge></Td>
            <Td className="font-medium">{Number(v.total).toFixed(2)} €</Td>
            <Td>
              <div className="flex items-center justify-end gap-2">
                {apiEnabled && (
                  <button className="row-action edit" title="Ver líneas" aria-label="Ver líneas" onClick={() => setLineasVenta(v)}>
                    <ListOrdered className="h-4 w-4" />
                  </button>
                )}
                <RowActions onDelete={() => { void dialog.confirm({ message: '¿Anular ticket?', danger: true }).then((ok) => { if (ok) remove(v.id); }); }} />
              </div>
            </Td>
          </tr>
        ))}
      </Table>

      {apiEnabled && lineasVenta && (
        <LineasVentaModal open saleId={String(lineasVenta.id)} onClose={() => setLineasVenta(null)} onChanged={refresh} />
      )}
    </ModuleGuard>
  );
}
