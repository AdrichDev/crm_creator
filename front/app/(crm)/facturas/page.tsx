'use client';
import { useMemo, useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useDialog } from '@/components/ui/dialog-provider';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Td, EmptyState, EstadoSelect } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/search-input';
import { facturaMatches } from '@/lib/facturacion/list-filter';
import { useCollection } from '@/lib/data/use-collection';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { useDocumentos } from '@/lib/data/use-documents';
import { facturas as seed, type Factura, type Documento } from '@/lib/mock/data';
import { isApiEnabled, apiFetch } from '@/lib/api/client';
import { useInvoiceMetrics } from '@/lib/data/use-invoice-metrics';
import { FacturaPreview } from '@/components/facturacion/factura-preview';

const eur = (n: number) => n.toFixed(2) + ' €';

// Set CERRADO de estados de una factura (PUT /invoices/:id/status), expuesto como opciones del
// <select> de estado (crm 5a). El literal se muestra en MAYÚSCULAS y conserva su forma real.
const INVOICE_ESTADOS = ['Pendiente', 'Pagada', 'Anulada'] as const;

// Colores del chip de estado (paridad AA `badgeVariantClass`): bg-X/20 + text-X-400 por estado.
const INVOICE_ESTADO_COLORS: Record<string, string> = {
  Pendiente: 'bg-amber-500/20 text-amber-400',
  Pagada: 'bg-emerald-500/20 text-emerald-400',
  Anulada: 'bg-red-500/20 text-red-400',
};

// Ordenación por cabecera (crm-operaos 10.3). Las 4 columnas tienen respaldo escalar en BD
// (cliente_nombre y fecha son columnas reales, a diferencia de pedidos) → TODAS se ordenan
// server-side en modo API (buildInvoicesOrderBy); en local/demo se ordena sobre el array.
type SortKey = 'numero' | 'cliente' | 'fecha' | 'estado';
function sortValue(f: Factura, key: SortKey): string {
  switch (key) {
    case 'numero': return f.numero ?? '';
    case 'cliente': return f.cliente ?? '';
    case 'fecha': return f.fecha ?? '';
    case 'estado': return f.estado ?? '';
  }
}
function sortFacturas(rows: Factura[], key: SortKey, dir: 'asc' | 'desc'): Factura[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sortValue(a, key).localeCompare(sortValue(b, key), 'es', { sensitivity: 'base' }) * m);
}

/**
 * Pantalla `Facturas` documental (crm-paridad-facturas-pedidos-aa Fase 2; detalle 10.3).
 *
 * Paridad con AA (`agents-agency/front/components/presupuestos/InvoiceList.tsx`): listado con
 * orden por cabecera, métricas (incl. "Importe cobrado"), edición de estado desde la fila
 * (badge → PUT /invoices/:id/status, set cerrado + pagadaEn) y vista previa DETALLADA (tabla
 * de líneas + desglose de IVA, snapshotados en la factura). SIN alta manual (POST cerrado en
 * PR-2b): las facturas nacen al aceptar un pedido o vía el operador (bot).
 */
export default function Page() {
  const term = useTerm('facturas', 'Facturas');
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'facturas');
  // Vista cliente: todas las facturas son suyas → se muestra el servicio recibido, no el cliente.
  const vistaCliente = role === 'cliente';
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

  // Modo generador: colección en localStorage. Modo API: listado paginado con orden
  // server-side. El rol cliente recibe 403 en /invoices (staffOnly) → no se pide al server.
  const { items: mockItems, update } = useCollection<Factura>('facturas', seed);
  const serverList = apiEnabled && !vistaCliente;
  const paged = usePaginatedApi<Factura>('/invoices', 20, serverList, {
    sort: sortKey || undefined,
    order: sortKey ? sortDir : undefined,
  });

  const displayItems = useMemo(() => {
    if (serverList) return paged.items; // el back ya ordenó (las 4 columnas son escalares)
    const rows = apiEnabled ? [] : mockItems; // cliente en API: lista vacía (403 staffOnly)
    return sortKey ? sortFacturas(rows, sortKey, sortDir) : rows;
  }, [serverList, apiEnabled, paged.items, mockItems, sortKey, sortDir]);

  // Filtro de lista (crm 5d): nº de factura, cliente o persona de contacto. Client-side sobre
  // la página ya cargada (el endpoint de facturas no expone `search`).
  const [filter, setFilter] = useState('');
  const filteredItems = useMemo(
    () => (filter.trim() ? displayItems.filter((f) => facturaMatches(f, filter)) : displayItems),
    [displayItems, filter],
  );

  // Modo API: documentos respaldados por /api/documents (scoped por negocio).
  const apiDocs = useDocumentos(apiEnabled);
  const [preview, setPreview] = useState<Factura | null>(null);

  const actual = preview ? displayItems.find((f) => f.id === preview.id) ?? preview : null;

  // KPIs: en modo API (staff) se leen del back, que los calcula sobre TODAS las facturas del
  // negocio (fix subconteo por paginación, PR-3). En local/demo no hay paginación → cálculo
  // cliente sobre el array completo.
  const { metrics, refresh: refreshMetrics } = useInvoiceMetrics(
    serverList,
    mockItems.map((f) => ({ estado: f.estado, total: Number(f.total) })),
  );

  // Confirmación previa (paridad AA): marcar Pagada o Anulada pide visto bueno ANTES de emitir
  // el PUT; si el usuario cancela, el chip se revierte y no se toca la factura.
  async function confirmEstado(next: string): Promise<boolean> {
    if (next === 'Pagada') {
      return dialog.confirm({
        title: '¿Marcar como pagada?',
        message: 'Se registrará el cobro de esta factura.',
        confirmLabel: 'Sí, marcar pagada', cancelLabel: 'Cancelar',
      });
    }
    if (next === 'Anulada') {
      return dialog.confirm({
        title: '¿Anular factura?',
        message: '¿Confirmas que esta factura queda anulada?',
        confirmLabel: 'Sí, anular', cancelLabel: 'Cancelar', danger: true,
      });
    }
    return true;
  }

  // Edición de estado desde la fila (10.3): badge → siguiente estado del ciclo cerrado.
  // API: PUT /invoices/:id/status (el back gestiona pagadaEn); local: emula la misma regla.
  async function updateEstado(id: Factura['id'], estado: string) {
    if (apiEnabled) {
      try { await apiFetch(`/invoices/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado }) }); }
      catch { /* p. ej. 422 de estado inválido: se ignora y se re-sincroniza */ }
      paged.refresh();
      await refreshMetrics(); // el cambio de estado altera Pendientes/Importe cobrado
    } else {
      update(id, { estado, pagadaEn: estado === 'Pagada' ? new Date().toISOString() : null });
    }
  }

  function addDoc(d: Documento) {
    if (!actual) return;
    update(actual.id, { documentos: [...(actual.documentos ?? []), d] });
  }
  function removeDoc(id: number | string) {
    if (!actual) return;
    update(actual.id, { documentos: (actual.documentos ?? []).filter((x) => x.id !== id) });
  }

  // Vista previa / impresión de una factura (task 2.3; detalle de líneas + IVA en 10.3).
  if (actual) {
    return (
      <ModuleGuard module="facturas">
        <FacturaPreview
          factura={actual}
          vistaCliente={vistaCliente}
          onBack={() => setPreview(null)}
          docs={apiEnabled ? apiDocs.docs : (actual.documentos ?? [])}
          canUpload={puedeEditar}
          onAddDoc={apiEnabled ? apiDocs.add : addDoc}
          onRemoveDoc={apiEnabled ? apiDocs.remove : removeDoc}
        />
      </ModuleGuard>
    );
  }

  return (
    <ModuleGuard module="facturas">
      {/* SIN botón de alta: la factura nace al aceptar un pedido (PR-2b cerró el alta manual). */}
      <PageHeader title={term} subtitle="Se generan automáticamente al aceptar un pedido." />

      {/* Métricas documentales (task 2.2 + KPI "Importe cobrado" de 10.3, paridad AA). */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Facturas" value={metrics.totalFacturas} accent />
        <Stat label="Pendientes" value={metrics.pendientes} />
        <Stat label="Importe total" value={eur(metrics.importeTotal)} />
        <Stat label="Importe cobrado" value={eur(metrics.importePagado)} />
        <Stat label="Importe pendiente" value={eur(metrics.importePendiente)} />
      </div>

      {displayItems.length === 0 ? (
        <EmptyState
          title="Aún no hay facturas"
          hint="Las facturas se crean automáticamente cuando un pedido pasa a «aceptada»."
        />
      ) : (
        <>
          <div className="mb-4">
            <SearchInput value={filter} onChange={setFilter} placeholder="Buscar por nº, cliente o contacto..." />
          </div>
          <Table
            sort={{ key: sortKey, dir: sortDir, onSort }}
            head={[
              { label: 'Nº Factura', sortKey: 'numero' },
              vistaCliente ? 'Tratamiento' : { label: 'Cliente', sortKey: 'cliente' },
              { label: 'Fecha', sortKey: 'fecha' },
              'Total',
              { label: 'Estado', sortKey: 'estado' },
              '',
            ]}
          >
            {filteredItems.map((f) => (
              <tr key={f.id}>
                <Td className="font-medium text-[var(--panel-text)]">{f.numero}</Td>
                <Td>{vistaCliente ? (f.servicio || f.lines?.[0]?.nombre || '—') : f.cliente}</Td>
                <Td>{f.fecha}</Td>
                <Td className="font-medium">{eur(Number(f.total))}</Td>
                <Td>
                  {/* Estado como <select> compartido (crm 5a): set cerrado Pendiente|Pagada|Anulada. */}
                  <EstadoSelect
                    value={f.estado}
                    options={INVOICE_ESTADOS}
                    colors={INVOICE_ESTADO_COLORS}
                    disabled={!puedeEditar}
                    title="Cambiar el estado de la factura"
                    onBeforeChange={confirmEstado}
                    onChange={(estado) => updateEstado(f.id, estado)}
                  />
                </Td>
                <Td>
                  <div className="flex justify-end">
                    <button className="row-action edit" onClick={() => setPreview(f)}>Ver / Imprimir</button>
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
