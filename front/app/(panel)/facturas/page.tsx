'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Td, Badge, Button, IconButton } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { Modal } from '@/components/ui/modal';
import { DocumentosPanel } from '@/components/ui/documentos-panel';
import { useCollection } from '@/lib/data/use-collection';
import { facturas as seed, type Factura, type Documento } from '@/lib/mock/data';
import { Plus, Info } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'numero', label: 'Nº de factura', required: true },
  { name: 'cliente', label: 'Cliente', required: true },
  { name: 'servicio', label: 'Tratamiento / servicio' },
  { name: 'fecha', label: 'Fecha', type: 'date', required: true },
  { name: 'total', label: 'Total (€)', type: 'number', step: '0.01', required: true },
  { name: 'estado', label: 'Estado', type: 'select', options: ['Pendiente', 'Pagada', 'Anulada'] },
];

const tone = (s: string) => s === 'Pagada' ? 'green' : s === 'Anulada' ? 'red' : 'amber';

export default function Page() {
  const term = useTerm('facturas', 'Facturas');
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'facturas');
  // Vista cliente: todas las facturas son suyas → no se muestra el cliente,
  // sino el tratamiento/servicio recibido. Igual para todos los verticales.
  const vistaCliente = role === 'cliente';
  const { items, create, update } = useCollection<Factura>('facturas', seed);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Factura | null>(null);

  const actual = info ? items.find((f) => f.id === info.id) ?? info : null;

  function onSubmit(v: Record<string, string | number>) {
    create({ estado: 'Pendiente', documentos: [], ...v } as unknown as Omit<Factura, 'id'>);
    setOpen(false);
  }
  function addDoc(d: Documento) {
    if (!actual) return;
    update(actual.id, { documentos: [...(actual.documentos ?? []), d] });
  }
  function removeDoc(id: number) {
    if (!actual) return;
    update(actual.id, { documentos: (actual.documentos ?? []).filter((x) => x.id !== id) });
  }

  const total = items.reduce((a, f) => a + Number(f.total), 0);

  return (
    <ModuleGuard module="facturas">
      <PageHeader title={term} subtitle="Facturación y documentos de clientes."
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nueva factura</Button>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Facturas" value={items.length} accent />
        <Stat label="Importe total" value={'€' + total.toFixed(2)} />
        <Stat label="Pendientes" value={items.filter((f) => f.estado === 'Pendiente').length} />
      </div>

      <Table head={['Nº', vistaCliente ? 'Tratamiento' : 'Cliente', 'Fecha', 'Total', 'Estado', 'Docs', '']}>
        {items.map((f) => (
          <tr key={f.id}>
            <Td className="font-medium text-[var(--panel-text)]">{f.numero}</Td>
            <Td>{vistaCliente ? (f.servicio || '—') : f.cliente}</Td>
            <Td>{f.fecha}</Td>
            <Td className="font-medium">€{Number(f.total).toFixed(2)}</Td>
            <Td><Badge tone={tone(f.estado)}>{f.estado}</Badge></Td>
            <Td>{f.documentos?.length ?? 0}</Td>
            <Td>
              <div className="flex justify-end">
                <IconButton title="Ver detalles" onClick={() => setInfo(f)}>
                  <Info className="h-4 w-4" />
                </IconButton>
              </div>
            </Td>
          </tr>
        ))}
      </Table>

      {/* Modal info: todos los datos + documentos */}
      <Modal open={!!actual} title={`Factura ${actual?.numero ?? ''}`} onClose={() => setInfo(null)}
        footer={<Button variant="outline" onClick={() => setInfo(null)}>Cerrar</Button>}>
        {actual && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {vistaCliente
                ? <div><span className="text-[var(--panel-muted)]">Tratamiento</span><p className="text-[var(--panel-text)]">{actual.servicio || '—'}</p></div>
                : <div><span className="text-[var(--panel-muted)]">Cliente</span><p className="text-[var(--panel-text)]">{actual.cliente}</p></div>}
              <div><span className="text-[var(--panel-muted)]">Fecha</span><p className="text-[var(--panel-text)]">{actual.fecha}</p></div>
              <div><span className="text-[var(--panel-muted)]">Total</span><p className="text-[var(--panel-text)]">€{Number(actual.total).toFixed(2)}</p></div>
              <div><span className="text-[var(--panel-muted)]">Estado</span><p><Badge tone={tone(actual.estado)}>{actual.estado}</Badge></p></div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <DocumentosPanel docs={actual.documentos ?? []} canUpload={puedeEditar} onAdd={addDoc} onRemove={removeDoc} />
            </div>
          </div>
        )}
      </Modal>

      <EntityModal open={open} title="Nueva factura" fields={FIELDS}
        initial={{ estado: 'Pendiente' }} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
