'use client';
import { useMemo, useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useDialog } from '@/components/ui/dialog-provider';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Td, EmptyState, Button, EstadoSelect, IconButton } from '@/components/ui/primitives';
import { Pencil } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { pedidoMatches } from '@/lib/facturacion/list-filter';
import { useCollection } from '@/lib/data/use-collection';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import {
  pedidos as seedPedidos, clientes as seedClientes, servicios as seedServicios,
  type Pedido, type Cliente, type Servicio,
} from '@/lib/mock/data';
import { isApiEnabled, apiFetch } from '@/lib/api/client';
import { usePedidoMetrics } from '@/lib/data/use-pedido-metrics';
import { PedidoPreview } from '@/components/facturacion/pedido-preview';
import { PedidoForm, type PedidoDraft, type Emisor, type ConceptoRow } from '@/components/facturacion/pedido-form';

const eur = (n: unknown) => '€' + Number(n ?? 0).toFixed(2);
const clienteNombre = (p: Pedido) => p.clienteSnapshot?.nombre || '—';

// Set CERRADO de estados de un presupuesto (mismo ciclo que AA), ahora expuesto como opciones
// del <select> de estado (crm 5a). El literal almacenado es en minúsculas; el <select> las
// muestra en MAYÚSCULAS.
const PEDIDO_ESTADOS = ['generada', 'aceptada', 'rechazada', 'caducada'] as const;

// Ordenación por cabecera. `numero`/`estado`/`createdAt` tienen respaldo escalar en BD → se
// ordenan server-side en modo API (buildPedidosOrderBy). `cliente` vive en clienteSnapshot
// (JSON) sin columna escalar → se ordena en cliente sobre la página cargada, en ambos modos.
type SortKey = 'numero' | 'cliente' | 'createdAt' | 'estado';
const SERVER_SORTABLE = new Set<SortKey>(['numero', 'createdAt', 'estado']);
function sortValue(p: Pedido, key: SortKey): string {
  switch (key) {
    case 'numero': return p.numero ?? '';
    case 'cliente': return p.clienteSnapshot?.nombre ?? '';
    case 'createdAt': return p.createdAt ?? '';
    case 'estado': return p.estado ?? '';
  }
}
function sortPedidos(rows: Pedido[], key: SortKey, dir: 'asc' | 'desc'): Pedido[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sortValue(a, key).localeCompare(sortValue(b, key), 'es', { sensitivity: 'base' }) * m);
}

const EMISOR_KEY = 'saas.emisor.v1';
const EMPTY_EMISOR: Emisor = { empresa: '', cif: '', direccion: '', email: '', telefono: '' };
function readEmisor(): Emisor {
  try { const r = localStorage.getItem(EMISOR_KEY); return r ? { ...EMPTY_EMISOR, ...JSON.parse(r) } : EMPTY_EMISOR; } catch { return EMPTY_EMISOR; }
}

/**
 * Pantalla `Presupuestos` documental (módulo id `pedidos`, ruta `/pedidos` — INTACTOS por
 * compatibilidad con la config por tenant; solo el rótulo visible pasa a "Presupuestos").
 *
 * Superficie NUEVA e independiente del TPV/carrito (`ventas`). Flujo espejo de AA
 * (`agents-agency/front/app/presupuestos/page.tsx`): máquina de vistas listado | alta/edición |
 * preview. Al pasar un presupuesto a `aceptada` (clic en el badge o desde el preview) el back
 * auto-genera su factura (PR-2b) vía PUT /pedidos/:id/status. Editar (PATCH /pedidos/:id) queda
 * bloqueado para los ya `aceptada` (tienen factura vinculada).
 */
export default function Page() {
  const term = useTerm('pedidos', 'Presupuestos');
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'pedidos');
  const apiEnabled = isApiEnabled();
  const dialog = useDialog();

  // Ordenación por cabecera (asc/desc toggle). Vacío = orden por defecto del back (createdAt desc).
  const [sortKey, setSortKey] = useState<'' | SortKey>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  function onSort(key: string) {
    if (sortKey === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key as SortKey);
    setSortDir('asc');
  }

  // Modo generador: colección en localStorage (items + alta/edición optimistas).
  const { items: mockItems, create, update } = useCollection<Pedido>('pedidos', seedPedidos);
  const { items: clientes } = useCollection<Cliente>('clientes', seedClientes);
  const { items: servicios } = useCollection<Servicio>('servicios', seedServicios);

  // Modo API: listado paginado con orden server-side (sort/order) para las columnas escalares.
  const paged = usePaginatedApi<Pedido>('/pedidos', 20, apiEnabled, {
    sort: sortKey && SERVER_SORTABLE.has(sortKey) ? sortKey : undefined,
    order: sortKey && SERVER_SORTABLE.has(sortKey) ? sortDir : undefined,
  });

  const mockRows = useMemo(
    () => (sortKey ? sortPedidos(mockItems, sortKey, sortDir) : mockItems),
    [mockItems, sortKey, sortDir],
  );
  // En API, el back ya ordenó las columnas escalares; `cliente` (JSON) se ordena en cliente.
  const displayItems = useMemo(() => {
    if (!apiEnabled) return mockRows;
    return sortKey === 'cliente' ? sortPedidos(paged.items, 'cliente', sortDir) : paged.items;
  }, [apiEnabled, mockRows, paged.items, sortKey, sortDir]);

  // Filtro de lista (crm 5d): nº de presupuesto, cliente (nombre/razón social) o persona de
  // contacto. Client-side sobre la página ya cargada (el endpoint solo busca por `numero`).
  const [filter, setFilter] = useState('');
  const filteredItems = useMemo(
    () => (filter.trim() ? displayItems.filter((p) => pedidoMatches(p, filter)) : displayItems),
    [displayItems, filter],
  );

  const [view, setView] = useState<'list' | 'create' | 'preview'>('list');
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [editingId, setEditingId] = useState<Pedido['id'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [emisor, setEmisor] = useState<Emisor>(() => (typeof window !== 'undefined' ? readEmisor() : EMPTY_EMISOR));

  const actual = selected ? displayItems.find((p) => p.id === selected.id) ?? selected : null;

  // KPIs: en modo API se leen del back (metrics sobre TODOS los pedidos del negocio); en local
  // se calculan sobre el array completo (sin paginación). Mismo criterio que Facturas (PR-3).
  const { metrics, refresh: refreshMetrics } = usePedidoMetrics(
    apiEnabled,
    mockItems.map((p) => ({ estado: p.estado, totalImpl: Number(p.totalImpl ?? 0) })),
  );

  async function updateEstado(id: Pedido['id'], estado: string) {
    if (apiEnabled) {
      try {
        await apiFetch(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado }) });
      } catch (err) {
        // Guard de des-aceptación (400/409): un presupuesto aceptado que ya generó factura
        // no puede volver atrás. Se avisa al usuario y el select se re-sincroniza al valor real.
        await dialog.alert(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
      }
      paged.refresh();
      await refreshMetrics(); // el cambio de estado altera "Aceptados"
    } else {
      update(id, { estado });
    }
  }

  function saveEmisor(e: Emisor) {
    setEmisor(e);
    try { localStorage.setItem(EMISOR_KEY, JSON.stringify(e)); } catch { /* noop */ }
  }

  // Catálogo de conceptos (servicios) para el formulario, en su forma base sin seleccionar.
  function baseConceptos(): ConceptoRow[] {
    return servicios.map((s: Servicio) => ({
      id: String(s.id), nombre: s.nombre, descripcion: s.categoria,
      precioImpl: Number(s.precio), precioMant: 0, selected: false, cantidad: 1,
    }));
  }

  function startCreate(): PedidoDraft {
    const year = new Date().getFullYear();
    return {
      linkedClientId: '', clientName: '', clientRazonSocial: '', clientCif: '', clientAddress: '',
      clientEmail: '', clientPhone: '', clientContact: '',
      // Sugerencia de numeración derivada del TOTAL de pedidos del negocio (metrics), no de
      // items.length (que en API es una sola página). Es solo una sugerencia editable.
      numero: `P-${year}-${String(metrics.totalPedidos + 1).padStart(3, '0')}`,
      conceptos: baseConceptos(),
    };
  }

  // Reconstruye el draft para EDITAR un presupuesto existente (cualquier estado salvo aceptada).
  // Generaliza el `handleEditRechazada` de AA: mismo nº (no añade sufijo) y precarga las líneas.
  // Una línea cuyo servicio no está en el catálogo (borrado o manual) se conserva como concepto.
  function draftFromPedido(p: Pedido): PedidoDraft {
    const catalog = baseConceptos();
    const byId = new Map(catalog.map((c) => [c.id, c]));
    for (const l of p.lines) {
      const key = l.servicioId ? String(l.servicioId) : '';
      const hit = key ? byId.get(key) : undefined;
      if (hit) {
        hit.selected = true; hit.cantidad = Number(l.cantidad) || 1;
        hit.precioImpl = Number(l.precioImpl) || 0; hit.precioMant = Number(l.precioMant) || 0;
        hit.nombre = l.nombre; hit.descripcion = l.descripcion ?? hit.descripcion;
      } else {
        catalog.push({
          id: key || `line-${catalog.length}`, nombre: l.nombre, descripcion: l.descripcion ?? '',
          precioImpl: Number(l.precioImpl) || 0, precioMant: Number(l.precioMant) || 0,
          selected: true, cantidad: Number(l.cantidad) || 1,
        });
      }
    }
    const cli = p.clienteSnapshot ?? {};
    return {
      linkedClientId: p.customerId ? String(p.customerId) : '',
      clientName: cli.nombre || '', clientRazonSocial: cli.razonSocial || '', clientCif: cli.cif || '',
      clientAddress: cli.direccion || '', clientEmail: cli.email || '', clientPhone: cli.telefono || '',
      clientContact: cli.contacto || '', numero: p.numero, conceptos: catalog,
    };
  }

  const [draft, setDraft] = useState<PedidoDraft | null>(null);

  function openCreate() { setEditingId(null); setDraft(startCreate()); setView('create'); }
  function openEdit(p: Pedido) { setEditingId(p.id); setDraft(draftFromPedido(p)); setView('create'); }

  async function handleSave(pedido: Omit<Pedido, 'id'>) {
    setSaving(true);
    try {
      if (apiEnabled) {
        if (editingId != null) await apiFetch(`/pedidos/${editingId}`, { method: 'PATCH', body: JSON.stringify(pedido) });
        else await apiFetch('/pedidos', { method: 'POST', body: JSON.stringify(pedido) });
        paged.refresh();
        await refreshMetrics();
      } else if (editingId != null) {
        update(editingId, pedido as Partial<Pedido>);
      } else {
        create(pedido);
      }
      setEditingId(null);
      setView('list');
    } catch {
      /* deja el formulario abierto para reintentar sin perder lo escrito */
    } finally {
      setSaving(false);
    }
  }

  // Vista previa / impresión.
  if (view === 'preview' && actual) {
    return (
      <ModuleGuard module="pedidos">
        <PedidoPreview pedido={actual} onBack={() => { setSelected(null); setView('list'); }} />
      </ModuleGuard>
    );
  }

  // Alta / edición de presupuesto.
  if (view === 'create' && draft) {
    return (
      <ModuleGuard module="pedidos">
        <PedidoForm
          key={String(editingId ?? 'new') + draft.numero}
          draft={draft}
          clientsList={clientes}
          emisor={emisor}
          saving={saving}
          editing={editingId != null}
          onSaveEmisor={saveEmisor}
          onCancel={() => { setEditingId(null); setView('list'); }}
          onGenerate={handleSave}
        />
      </ModuleGuard>
    );
  }

  return (
    <ModuleGuard module="pedidos">
      <PageHeader
        title={term}
        subtitle="Presupuestos comerciales documentales, con vista previa imprimible."
        action={<Button variant="primary" onClick={openCreate}>+ Nuevo presupuesto</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Presupuestos" value={metrics.totalPedidos} accent />
        <Stat label="Aceptados" value={metrics.aceptados} />
        <Stat label="Importe (pago único)" value={eur(metrics.importeTotal)} />
      </div>

      {displayItems.length === 0 ? (
        <EmptyState
          title="Aún no hay presupuestos"
          hint='Pulsa en "Nuevo presupuesto" para crear un presupuesto comercial.'
        />
      ) : (
        <>
          <div className="mb-4">
            <SearchInput value={filter} onChange={setFilter} placeholder="Buscar por nº, cliente o contacto..." />
          </div>
          <Table
            sort={{ key: sortKey, dir: sortDir, onSort }}
            head={[
              { label: 'Nº Presupuesto', sortKey: 'numero' }, { label: 'Cliente', sortKey: 'cliente' },
              { label: 'Fecha', sortKey: 'createdAt' }, 'Total', { label: 'Estado', sortKey: 'estado' }, '',
            ]}
          >
            {filteredItems.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium text-[var(--panel-text)]">{p.numero}</Td>
                <Td>{clienteNombre(p)}</Td>
                <Td>{(p.createdAt || '').slice(0, 10)}</Td>
                <Td className="font-medium">{eur(p.totalImpl)}</Td>
                <Td>
                  {/* Estado como <select> (crm 5a): un presupuesto aceptado con factura no puede
                      des-aceptarse → el back responde 400 y updateEstado re-sincroniza. */}
                  <EstadoSelect
                    value={p.estado}
                    options={PEDIDO_ESTADOS}
                    disabled={!puedeEditar}
                    title="Cambiar el estado del presupuesto"
                    onChange={(estado) => updateEstado(p.id, estado)}
                  />
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-2">
                    {/* Un presupuesto aceptado ya generó su factura → edición bloqueada (back 409). */}
                    {puedeEditar && p.estado !== 'aceptada' && (
                      <IconButton tone="edit" title="Editar" ariaLabel="Editar" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                    <button className="row-action edit" onClick={() => { setSelected(p); setView('preview'); }}>Ver / Imprimir</button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </ModuleGuard>
  );
}
