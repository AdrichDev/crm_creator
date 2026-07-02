'use client';
import { useMemo, useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { useRouter } from 'next/navigation';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole, useTenantConfig } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { clientesMock, clienteExtraFields } from '@/lib/config/sector-data';
import { PageHeader, Stat, Table, Td, Badge, Button, IconButton } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { Modal } from '@/components/ui/modal';
import { DocumentosPanel } from '@/components/ui/documentos-panel';
import { useCollection } from '@/lib/data/use-collection';
import { useDocumentos } from '@/lib/data/use-documents';
import { type Cliente, type Documento, facturas as facturasSeed, type Factura } from '@/lib/mock/data';
import { UserPlus, Info, Euro, Pencil, Trash2 } from 'lucide-react';
import { isApiEnabled } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';

// Shape que devuelve el back para /customers paginado.
type ClienteApiRow = {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  visitas: number;
  gastoTotal: number;
  ultimaVisita: string;
  segmento: string;
  estado: string;
};

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'contacto', label: 'Persona de contacto' },
  { name: 'cif', label: 'NIF / CIF' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'telefono', label: 'Teléfono' },
  { name: 'direccion', label: 'Dirección' },
  { name: 'segmento', label: 'Segmento', type: 'select', options: ['Nuevo', 'Recurrente', 'VIP'] },
  { name: 'visitas', label: 'Visitas', type: 'number' },
  { name: 'gastoTotal', label: 'Gasto total (€)', type: 'number', step: '0.01' },
  { name: 'ultimaVisita', label: 'Última visita', type: 'date' },
];

export default function Page() {
  const term = useTerm('clientes', 'Clientes');
  const router = useRouter();
  const { role } = useRole();
  const { config } = useTenantConfig();
  const vertical = config.business.vertical;
  const puedeEditar = canWrite(role, 'clientes');
  const seed = useMemo(() => clientesMock(vertical), [vertical]);
  const extraFields = clienteExtraFields(vertical);
  const apiEnabled = isApiEnabled();

  // Modo generador: localStorage / mock.
  const { items: collectionItems, create, update, remove } = useCollection<Cliente>('clientes', seed);
  const { items: facturas } = useCollection<Factura>('facturas', facturasSeed);
  const conFactura = new Set(facturas.map((f) => f.cliente));

  // Modo API: paginación server-side.
  const paged = usePaginatedApi<ClienteApiRow>('/customers', 20, apiEnabled);
  // Modo API: documentos respaldados por /api/documents (scoped por negocio).
  const apiDocs = useDocumentos(apiEnabled);

  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [info, setInfo] = useState<Cliente | null>(null);
  const tone = (s: string) => s === 'VIP' ? 'brand' : s === 'Nuevo' ? 'blue' : 'gray';

  // Items de visualización (tabla).
  const displayItems = (apiEnabled ? paged.items : collectionItems) as unknown as Cliente[];
  const actual = info ? displayItems.find((c) => c.id === info.id) ?? info : null;

  function onNew() { setEditing(null); setOpen(true); }
  function onEdit(c: Cliente) { setEditing(c); setOpen(true); }
  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Cliente>);
    else create({ documentos: [], ...v } as unknown as Omit<Cliente, 'id'>);
    setOpen(false);
    if (apiEnabled) paged.refresh();
  }
  function addDoc(d: Documento) {
    if (!actual) return;
    update(actual.id, { documentos: [...(actual.documentos ?? []), d] });
  }
  function removeDoc(id: number | string) {
    if (!actual) return;
    update(actual.id, { documentos: (actual.documentos ?? []).filter((x) => x.id !== id) });
  }

  return (
    <ModuleGuard module="clientes">
      <PageHeader title={term} subtitle="CRM: fichas, historial, facturación y documentos."
        action={<Button onClick={onNew}><UserPlus className="h-4 w-4" /> Nuevo</Button>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={apiEnabled ? paged.total : displayItems.length} accent />
        <Stat label="VIP" value={displayItems.filter((c) => c.segmento === 'VIP').length} />
        <Stat label="Gasto medio" value={'€' + (displayItems.length ? Math.round(displayItems.reduce((a, c) => a + Number(c.gastoTotal), 0) / displayItems.length) : 0)} />
      </div>

      {apiEnabled && (
        <div className="mb-4">
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar cliente..." />
        </div>
      )}

      <Table head={['Nombre', 'Contacto', 'Visitas', 'Gasto', 'Segmento', 'Facturas', 'Acciones']}>
        {displayItems.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium text-white">{c.nombre}</Td>
            <Td><div>{c.email}</div><div className="text-xs text-[var(--panel-muted)]">{c.telefono}</div></Td>
            <Td>{c.visitas}</Td>
            <Td>€{c.gastoTotal}</Td>
            <Td><Badge tone={tone(c.segmento)}>{c.segmento}</Badge></Td>
            <Td>
              <button
                className={`inline-grid place-items-center w-8 h-8 rounded-lg border transition ${
                  conFactura.has(c.nombre)
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    : 'border-white/10 text-[var(--panel-muted)] hover:text-[var(--acc)] hover:border-[var(--acc)]'
                }`}
                title={conFactura.has(c.nombre) ? 'Ver facturas del cliente' : 'Sin facturas — ir a facturación'}
                onClick={() => router.push('/facturas')}>
                <Euro className="h-4 w-4" />
              </button>
            </Td>
            <Td>
              <div className="flex items-center justify-end gap-2">
                <IconButton title="Ver ficha y documentos" onClick={() => setInfo(c)}>
                  <Info className="h-4 w-4" />
                </IconButton>
                {puedeEditar && (
                  <>
                    <IconButton title="Editar" onClick={() => onEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton danger title="Eliminar"
                      onClick={() => { void dialog.confirm({ message: '¿Eliminar cliente?', danger: true }).then((ok) => { if (ok) remove(c.id); }); }}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </>
                )}
              </div>
            </Td>
          </tr>
        ))}
      </Table>

      {apiEnabled && (
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} limit={paged.limit} onChange={paged.setPage} />
      )}

      {/* Modal info: todos los datos + documentos */}
      <Modal open={!!actual} title={actual?.nombre ?? ''} onClose={() => setInfo(null)}
        footer={<Button variant="outline" onClick={() => setInfo(null)}>Cerrar</Button>}>
        {actual && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {([['contacto', 'Contacto'], ['cif', 'NIF / CIF'], ['email', 'Email'], ['telefono', 'Teléfono'],
                 ['direccion', 'Dirección'], ['segmento', 'Segmento'], ['visitas', 'Visitas'],
                 ['gastoTotal', 'Gasto total'], ['ultimaVisita', 'Última visita']] as const).map(([k, label]) => (
                <div key={k}>
                  <span className="text-[var(--panel-muted)]">{label}</span>
                  <p className="text-white">{String((actual as unknown as Record<string, unknown>)[k] ?? '—') || '—'}</p>
                </div>
              ))}
              {extraFields.map((f) => (
                <div key={f.name}>
                  <span className="text-[var(--panel-muted)]">{f.label}</span>
                  <p className="text-white">{actual.extra?.[f.name] || '—'}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 pt-4">
              <DocumentosPanel
                docs={apiEnabled ? apiDocs.docs : (actual.documentos ?? [])}
                canUpload={puedeEditar}
                onAdd={apiEnabled ? apiDocs.add : addDoc}
                onRemove={apiEnabled ? apiDocs.remove : removeDoc} />
            </div>
          </div>
        )}
      </Modal>

      <EntityModal open={open} title={editing ? 'Editar cliente' : 'Nuevo cliente'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />
    </ModuleGuard>
  );
}
