'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Td, Badge, EmptyState, Button } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import {
  pedidos as seedPedidos, clientes as seedClientes, servicios as seedServicios,
  type Pedido, type Cliente, type Servicio,
} from '@/lib/mock/data';
import { isApiEnabled, apiFetch } from '@/lib/api/client';
import { usePedidoMetrics } from '@/lib/data/use-pedido-metrics';
import { PedidoPreview, pedidoTone } from '@/components/facturacion/pedido-preview';
import { PedidoForm, type PedidoDraft, type Emisor, type ConceptoRow } from '@/components/facturacion/pedido-form';

const eur = (n: unknown) => '€' + Number(n ?? 0).toFixed(2);
const clienteNombre = (p: Pedido) => p.clienteSnapshot?.nombre || '—';

// Ciclo de estados idéntico al de AA (clic en el badge → siguiente estado).
const CYCLE = ['generada', 'aceptada', 'rechazada', 'caducada'] as const;
const nextEstado = (e: string) => CYCLE[(CYCLE.indexOf(e as typeof CYCLE[number]) + 1) % CYCLE.length];

const EMISOR_KEY = 'saas.emisor.v1';
const EMPTY_EMISOR: Emisor = { empresa: '', cif: '', direccion: '', email: '', telefono: '' };
function readEmisor(): Emisor {
  try { const r = localStorage.getItem(EMISOR_KEY); return r ? { ...EMPTY_EMISOR, ...JSON.parse(r) } : EMPTY_EMISOR; } catch { return EMPTY_EMISOR; }
}

/**
 * Pantalla `Pedidos` documental (crm-paridad-facturas-pedidos-aa, Fase 3, tasks 3.1/3.2/3.3).
 *
 * Superficie NUEVA e independiente del TPV/carrito (`ventas`), que NO se toca (design.md
 * § decisión 2). Flujo espejo de AA (`agents-agency/front/app/facturacion/page.tsx`):
 * máquina de vistas listado | alta | preview. El alta reproduce el `BudgetForm` de AA; el
 * documento imprimible reproduce el `BudgetPreview`. Al pasar un pedido a `aceptada` (clic en
 * el badge o desde el preview) el back auto-genera su factura (PR-2b) vía PUT /pedidos/:id/status.
 * Con esto, crear un documento comercial NO obliga a pasar por el TPV (task 3.3): Pedidos es
 * una entrada de menú de primer nivel, alternativa real a Ventas.
 */
export default function Page() {
  const term = useTerm('pedidos', 'Pedidos');
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'pedidos');
  const apiEnabled = isApiEnabled();

  const { items, create, update, refresh } = useCollection<Pedido>('pedidos', seedPedidos);
  const { items: clientes } = useCollection<Cliente>('clientes', seedClientes);
  const { items: servicios } = useCollection<Servicio>('servicios', seedServicios);

  const [view, setView] = useState<'list' | 'create' | 'preview'>('list');
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [saving, setSaving] = useState(false);
  const [emisor, setEmisor] = useState<Emisor>(() => (typeof window !== 'undefined' ? readEmisor() : EMPTY_EMISOR));

  const actual = selected ? items.find((p) => p.id === selected.id) ?? selected : null;

  // KPIs: en modo API se leen del back (`GET /pedidos` → `metrics`, calculadas sobre TODOS los
  // pedidos del negocio). Antes se derivaban aquí con filter/reduce sobre `items`, pero `items`
  // es UNA página del listado (default 20) → subconteo silencioso con más pedidos que el page
  // size. Mismo bug y mismo fix que Facturas en PR-3 (use-invoice-metrics). En local/demo no
  // hay paginación (array completo) → cálculo cliente correcto como fallback.
  const { metrics, refresh: refreshMetrics } = usePedidoMetrics(
    apiEnabled,
    items.map((p) => ({ estado: p.estado, totalImpl: Number(p.totalImpl ?? 0) })),
  );

  async function updateEstado(id: Pedido['id'], estado: string) {
    if (apiEnabled) {
      try { await apiFetch(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado }) }); }
      catch { /* p. ej. guard de des-aceptación (400): se ignora y se re-sincroniza */ }
      await refresh();
      await refreshMetrics(); // el cambio de estado altera "Aceptados"
    } else {
      update(id, { estado });
    }
  }

  function saveEmisor(e: Emisor) {
    setEmisor(e);
    try { localStorage.setItem(EMISOR_KEY, JSON.stringify(e)); } catch { /* noop */ }
  }

  function startCreate(): PedidoDraft {
    const year = new Date().getFullYear();
    const conceptos: ConceptoRow[] = servicios.map((s: Servicio) => ({
      id: String(s.id), nombre: s.nombre, descripcion: s.categoria,
      precioImpl: Number(s.precio), precioMant: 0, selected: false, cantidad: 1,
    }));
    return {
      linkedClientId: '', clientName: '', clientCif: '', clientAddress: '',
      clientEmail: '', clientPhone: '', clientContact: '',
      // Sugerencia de numeración derivada del TOTAL de pedidos del negocio (metrics), no de
      // `items.length`: en modo API `items` es una sola página → con 2+ páginas la sugerencia
      // se repetía. Es solo una sugerencia editable (el back no exige unicidad de `numero`).
      numero: `P-${year}-${String(metrics.totalPedidos + 1).padStart(3, '0')}`,
      conceptos,
    };
  }
  const [draft, setDraft] = useState<PedidoDraft | null>(null);

  async function handleGenerate(pedido: Omit<Pedido, 'id'>) {
    setSaving(true);
    try {
      create(pedido);
      if (apiEnabled) { await refresh(); await refreshMetrics(); }
      setView('list');
    } finally {
      setSaving(false);
    }
  }

  // Vista previa / impresión (task 3.1).
  if (view === 'preview' && actual) {
    return (
      <ModuleGuard module="pedidos">
        <PedidoPreview pedido={actual} onBack={() => { setSelected(null); setView('list'); }} />
      </ModuleGuard>
    );
  }

  // Alta de pedido (tasks 3.1/3.2).
  if (view === 'create' && draft) {
    return (
      <ModuleGuard module="pedidos">
        <PedidoForm
          draft={draft}
          clientsList={clientes}
          emisor={emisor}
          saving={saving}
          onSaveEmisor={saveEmisor}
          onCancel={() => setView('list')}
          onGenerate={handleGenerate}
        />
      </ModuleGuard>
    );
  }

  return (
    <ModuleGuard module="pedidos">
      <PageHeader
        title={term}
        subtitle="Presupuestos y pedidos comerciales documentales, alternativa al TPV."
        action={<Button variant="primary" onClick={() => { setDraft(startCreate()); setView('create'); }}>+ Nuevo pedido</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Pedidos" value={metrics.totalPedidos} accent />
        <Stat label="Aceptados" value={metrics.aceptados} />
        <Stat label="Importe (pago único)" value={eur(metrics.importeTotal)} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Aún no hay pedidos"
          hint='Pulsa en "Nuevo pedido" para crear un presupuesto comercial.'
        />
      ) : (
        <Table head={['Nº', 'Cliente', 'Fecha', 'Total', 'Estado', '']}>
          {items.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium text-[var(--panel-text)]">{p.numero}</Td>
              <Td>{clienteNombre(p)}</Td>
              <Td>{(p.createdAt || '').slice(0, 10)}</Td>
              <Td className="font-medium">{eur(p.totalImpl)}</Td>
              <Td>
                {puedeEditar ? (
                  <button
                    title="Clic para cambiar el estado (generada → aceptada → rechazada → caducada)"
                    onClick={() => updateEstado(p.id, nextEstado(p.estado))}
                    className="cursor-pointer transition hover:opacity-80"
                  >
                    <Badge tone={pedidoTone(p.estado)}>{p.estado}</Badge>
                  </button>
                ) : (
                  <Badge tone={pedidoTone(p.estado)}>{p.estado}</Badge>
                )}
              </Td>
              <Td>
                <div className="flex justify-end">
                  <button className="row-action edit" onClick={() => { setSelected(p); setView('preview'); }}>Ver / Imprimir</button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </ModuleGuard>
  );
}
