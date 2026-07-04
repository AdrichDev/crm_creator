'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Td, Badge, EmptyState } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import { useDocumentos } from '@/lib/data/use-documents';
import { facturas as seed, type Factura, type Documento } from '@/lib/mock/data';
import { isApiEnabled } from '@/lib/api/client';
import { useInvoiceMetrics } from '@/lib/data/use-invoice-metrics';
import { FacturaPreview } from '@/components/facturacion/factura-preview';

const tone = (s: string) => (s === 'Pagada' ? 'green' : s === 'Anulada' ? 'red' : 'amber');
const eur = (n: number) => '€' + n.toFixed(2);

/**
 * Pantalla `Facturas` documental (crm-paridad-facturas-pedidos-aa, Fase 2).
 *
 * Paridad con AA (`agents-agency/front/app/facturas/page.tsx`): listado + métricas +
 * acción `Ver / Imprimir` que abre una vista previa imprimible. SIN alta manual: la
 * creación se cerró en PR-2b (POST /api/invoices → 405); las facturas nacen al aceptar
 * un pedido (PUT /pedidos/:id/status → ensureInvoiceForPedido). Las métricas se derivan
 * con `computeInvoiceMetrics` (mismo criterio que el cálculo inline anterior).
 */
export default function Page() {
  const term = useTerm('facturas', 'Facturas');
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'facturas');
  // Vista cliente: todas las facturas son suyas → se muestra el servicio recibido, no el cliente.
  const vistaCliente = role === 'cliente';
  const apiEnabled = isApiEnabled();
  const { items, update } = useCollection<Factura>('facturas', seed);
  // Modo API: documentos respaldados por /api/documents (scoped por negocio).
  const apiDocs = useDocumentos(apiEnabled);
  const [preview, setPreview] = useState<Factura | null>(null);

  const actual = preview ? items.find((f) => f.id === preview.id) ?? preview : null;

  // KPIs: en modo API (staff) se leen del back, que los calcula sobre TODAS las facturas del
  // negocio (fix subconteo por paginación, PR-3). El rol cliente recibe 403 en /invoices
  // (staffOnly) y ve lista vacía → no se pide al server, se deriva del array local (vacío).
  // En local/demo no hay paginación → cálculo cliente sobre el array completo.
  const serverMetrics = apiEnabled && !vistaCliente;
  const { metrics } = useInvoiceMetrics(serverMetrics, items.map((f) => ({ estado: f.estado, total: Number(f.total) })));

  function addDoc(d: Documento) {
    if (!actual) return;
    update(actual.id, { documentos: [...(actual.documentos ?? []), d] });
  }
  function removeDoc(id: number | string) {
    if (!actual) return;
    update(actual.id, { documentos: (actual.documentos ?? []).filter((x) => x.id !== id) });
  }

  // Vista previa / impresión de una factura (task 2.3).
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

      {/* Métricas documentales (task 2.2) derivadas por computeInvoiceMetrics (task 1.3). */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Facturas" value={metrics.totalFacturas} accent />
        <Stat label="Pendientes" value={metrics.pendientes} />
        <Stat label="Importe total" value={eur(metrics.importeTotal)} />
        <Stat label="Importe pendiente" value={eur(metrics.importePendiente)} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Aún no hay facturas"
          hint="Las facturas se crean automáticamente cuando un pedido pasa a «aceptada»."
        />
      ) : (
        <Table head={['Nº', vistaCliente ? 'Tratamiento' : 'Cliente', 'Fecha', 'Total', 'Estado', 'Docs', '']}>
          {items.map((f) => (
            <tr key={f.id}>
              <Td className="font-medium text-[var(--panel-text)]">{f.numero}</Td>
              <Td>{vistaCliente ? (f.servicio || '—') : f.cliente}</Td>
              <Td>{f.fecha}</Td>
              <Td className="font-medium">{eur(Number(f.total))}</Td>
              <Td><Badge tone={tone(f.estado)}>{f.estado}</Badge></Td>
              <Td>{f.documentos?.length ?? 0}</Td>
              <Td>
                <div className="flex justify-end">
                  <button className="row-action edit" onClick={() => setPreview(f)}>Ver / Imprimir</button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </ModuleGuard>
  );
}
