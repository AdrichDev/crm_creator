'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, MapPin } from 'lucide-react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Table, Button, EmptyState } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { useDialog } from '@/components/ui/dialog-provider';
import { isApiEnabled, apiFetch } from '@/lib/api/client';
import { useCollection } from '@/lib/data/use-collection';
import {
  ContactosLista, CONTACTOS_HEAD, CONTACTADO_CYCLE, CONTACTADO_LABELS, CONTACTOS_SEED, EMPTY_FORM, formatDateTime,
  type ContactoRow, type ContactoForm,
} from '@/components/crm/contactos-lista';
import { ContactoFormModal } from '@/components/crm/contacto-modal';
import { buildGoogleMapsSearchUrl } from '@/lib/citas/google-maps-url';

const LIMIT = 20;

export default function ContactosPage() {
  const term = useTerm('contactos', 'Contactos');
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'contactos');
  const apiEnabled = isApiEnabled();
  const dialog = useDialog();

  // Búsqueda + paginación + ordenación por cabecera.
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Columnas ordenables: codigo, tipo, nombre, email, sector, createdAt (Fecha de alta).
  // Server-side en modo API (sort/order), client-side en modo generador. Vacío = orden
  // por defecto del back (createdAt desc).
  type SortKey = 'codigo' | 'tipo' | 'nombre' | 'email' | 'sector' | 'createdAt';
  const [sortKey, setSortKey] = useState<'' | SortKey>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  function onSort(key: string) {
    setPage(1);
    if (sortKey === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key as SortKey);
    setSortDir('asc');
  }

  // Modo API: datos remotos con filtros y paginación server-side.
  const [apiRows, setApiRows] = useState<ContactoRow[]>([]);
  const [apiTotal, setApiTotal] = useState(0);
  // Guardia de orden de respuestas (mismo patrón que usePaginatedApi.requestId):
  // cada tecleo en los filtros dispara un GET (sin debounce) y pueden quedar varios
  // en vuelo sin garantía de orden. Sin esta guardia, un GET viejo (con snapshot
  // ANTERIOR a un PATCH de edición) podía resolver DESPUÉS del refetch post-guardado
  // y pisar la fila recién editada — la edición "no persistía" visualmente.
  const fetchSeq = useRef(0);
  const fetchApi = useCallback(async () => {
    if (!apiEnabled) return;
    const myId = ++fetchSeq.current;
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set('search', search);
    if (sortKey) { params.set('sort', sortKey); params.set('order', sortDir); }
    try {
      const data = await apiFetch<{ items: ContactoRow[]; total: number }>(`/contactos?${params.toString()}`);
      if (myId !== fetchSeq.current) return; // respuesta obsoleta: no pisar datos más nuevos
      setApiRows(data.items);
      setApiTotal(data.total);
    } catch {
      if (myId !== fetchSeq.current) return;
      setApiRows([]);
      setApiTotal(0);
    }
  }, [apiEnabled, page, search, sortKey, sortDir]);
  useEffect(() => { void fetchApi(); }, [fetchApi]);

  // Modo generador: colección en localStorage con búsqueda + ordenación client-side.
  const seed = useMemo(() => CONTACTOS_SEED, []);
  const { items: mockItems, create, update, remove } = useCollection<ContactoRow>('contactos', seed);
  const mockRows = useMemo(() => {
    const term2 = search.trim().toLowerCase();
    const filtered = mockItems.filter((c) =>
      !term2 || [c.nombre, c.codigo, c.email, c.telefono, c.sector].some((v) => (v || '').toLowerCase().includes(term2)),
    );
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) =>
      String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'es', { sensitivity: 'base' }) * dir,
    );
  }, [mockItems, search, sortKey, sortDir]);

  const rows = apiEnabled ? apiRows : mockRows;
  const total = apiEnabled ? apiTotal : mockRows.length;
  const totalPages = Math.ceil(total / LIMIT);
  const pendientes = rows.filter((c) => c.contactado !== 'si').length;

  // Modal alta / edición.
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [info, setInfo] = useState<ContactoRow | null>(null);

  // Enlace a Google Maps del contacto abierto en el modal: Contacto no tiene
  // coordenadas (a diferencia de Customer), así que siempre se construye por
  // texto de dirección. Sin dirección → sin pin (mismo criterio que Clientes).
  // Aditivo (crm-operaos 9.2): número estructurado anexado a la calle si existe;
  // sin número la búsqueda queda exactamente como antes.
  const infoMapsUrl = useMemo(() => {
    if (!info) return null;
    const calle = info.direccion?.trim();
    const numero = info.numero?.trim();
    return buildGoogleMapsSearchUrl(calle && numero ? `${calle} ${numero}` : info.direccion);
  }, [info]);

  // Modo selección → añadir a cliente.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmConvertOpen, setConfirmConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const selectedRows = rows.filter((c) => selectedIds.has(c.id));

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); };
  const openEdit = (c: ContactoRow) => {
    setEditingId(c.id);
    setForm({
      tipo: c.tipo, nombre: c.nombre, telefono: c.telefono ?? '', email: c.email ?? '', sector: c.sector ?? '',
      direccion: c.direccion ?? '', numero: c.numero ?? '', piso: c.piso ?? '', codigoPostal: c.codigoPostal ?? '', localidad: c.localidad ?? '',
    });
    setFormError('');
    setModalOpen(true);
  };

  async function handleSave() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return; }
    setSaving(true); setFormError('');
    const payload: Record<string, unknown> = { tipo: form.tipo, nombre: form.nombre.trim() };
    for (const key of ['telefono', 'email', 'sector', 'direccion', 'numero', 'piso', 'codigoPostal', 'localidad'] as const) {
      const v = form[key].trim();
      if (v) payload[key] = v; else if (editingId) payload[key] = null;
    }
    try {
      if (apiEnabled) {
        await apiFetch(editingId ? `/contactos/${editingId}` : '/contactos', {
          method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload),
        });
        await fetchApi();
      } else if (editingId) {
        update(editingId, payload as Partial<ContactoRow>);
      } else {
        create({ codigo: `pc-${String(mockItems.length + 1).padStart(2, '0')}`, contactado: 'no', createdAt: new Date().toISOString(), peticion: null, telefono: null, email: null, sector: null, direccion: null, numero: null, piso: null, codigoPostal: null, localidad: null, ...payload } as Omit<ContactoRow, 'id'>);
      }
      setModalOpen(false);
    } catch {
      setFormError('No se pudo guardar el contacto.');
    } finally { setSaving(false); }
  }

  async function cycleContactado(c: ContactoRow) {
    const next = CONTACTADO_CYCLE[c.contactado];
    if (apiEnabled) {
      setApiRows((prev) => prev.map((x) => (x.id === c.id ? { ...x, contactado: next } : x)));
      try {
        await apiFetch(`/contactos/${c.id}`, { method: 'PATCH', body: JSON.stringify({ contactado: next }) });
      } catch { await fetchApi(); }
    } else {
      update(c.id, { contactado: next });
    }
  }

  async function handleDelete(c: ContactoRow) {
    const ok = await dialog.confirm({ title: 'Eliminar contacto', message: `¿Eliminar el contacto "${c.nombre}" (${c.codigo})?`, danger: true });
    if (!ok) return;
    if (apiEnabled) {
      try { await apiFetch(`/contactos/${c.id}`, { method: 'DELETE' }); await fetchApi(); } catch { /* noop */ }
    } else {
      remove(c.id);
    }
  }

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const startSelection = () => { setSelectionMode(true); setSelectedIds(new Set()); };
  const cancelSelection = () => { setSelectionMode(false); setSelectedIds(new Set()); };

  async function handleConvert() {
    setConverting(true);
    try {
      if (apiEnabled) {
        await apiFetch('/contactos/convert', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds] }) });
        await fetchApi();
      } else {
        selectedIds.forEach((id) => remove(id));
      }
      setConfirmConvertOpen(false);
      cancelSelection();
    } catch { /* noop */ } finally { setConverting(false); }
  }

  return (
    <ModuleGuard module="contactos">
      <PageHeader title={term} subtitle="Leads y prospectos comerciales con su estado de contacto."
        action={<Button onClick={openCreate}><UserPlus className="h-4 w-4" /> Nuevo contacto</Button>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={total} accent />
        <Stat label="Pendientes" value={pendientes} />
        <Stat label="Contactados" value={rows.length - pendientes} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar contacto..." />
        {puedeEditar && (
          <div className="ml-auto flex items-center gap-2">
            {selectionMode ? (
              <>
                <Button onClick={() => setConfirmConvertOpen(true)} disabled={selectedIds.size === 0}>
                  Aceptar{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </Button>
                <Button variant="ghost" onClick={cancelSelection}>Cancelar</Button>
              </>
            ) : (
              <Button variant="outline" onClick={startSelection}>Añadir a cliente</Button>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No hay contactos" hint='Pulsa en "Nuevo contacto" o usa el buscador.' />
      ) : (
        <Table head={CONTACTOS_HEAD(selectionMode)} sort={{ key: sortKey, dir: sortDir, onSort }}>
          <ContactosLista rows={rows} puedeEditar={puedeEditar} selectionMode={selectionMode} selectedIds={selectedIds}
            onToggleSelect={toggleSelect} onCycleContactado={cycleContactado} onInfo={setInfo} onEdit={openEdit} onDelete={handleDelete} />
        </Table>
      )}

      {apiEnabled && <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onChange={setPage} />}

      <ContactoFormModal open={modalOpen} editing={!!editingId} form={form} setForm={setForm}
        saving={saving} error={formError} onClose={() => setModalOpen(false)} onSave={handleSave} />

      {/* Modal de información del contacto */}
      <Modal open={!!info} title="Información del contacto" onClose={() => setInfo(null)}
        footer={<Button variant="outline" onClick={() => setInfo(null)}>Cerrar</Button>}>
        {info && (
          <dl className="divide-y divide-white/10 text-sm">
            {([
              ['Código', info.codigo], ['Nombre', info.nombre], ['Tipo', info.tipo === 'lead' ? 'Lead' : 'Prospecto'],
              ['Teléfono', info.telefono || '—'], ['Email', info.email || '—'], ['Sector', info.sector || '—'],
              // Dirección estructurada agrupada: calle → número → piso → código postal (crm-operaos 9.2).
              ['Dirección', info.direccion || '—'], ['Número', info.numero || '—'],
              ['Piso', info.piso || '—'], ['Código postal', info.codigoPostal || '—'],
              ['Localidad', info.localidad || '—'],
              ['Contactado', CONTACTADO_LABELS[info.contactado] ?? 'NC'],
              ['Fecha de alta', formatDateTime(info.createdAt)], ['Petición', info.peticion || '—'],
            ] as const).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--acc)]">{label}</dt>
                <dd className="flex items-center gap-2 text-white">
                  <span className="whitespace-pre-wrap break-words">{value}</span>
                  {label === 'Dirección' && infoMapsUrl && (
                    <a href={infoMapsUrl} target="_blank" rel="noreferrer" title="Abrir en Google Maps"
                      className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--acc)] transition hover:bg-[var(--hover-bg)]">
                      <MapPin className="h-4 w-4" />
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      {/* Modal confirmación: añadir a cliente */}
      <Modal open={confirmConvertOpen} title="Añadir contactos a cliente" onClose={() => setConfirmConvertOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmConvertOpen(false)} disabled={converting}>Cancelar</Button>
            <Button onClick={handleConvert} disabled={converting || selectedRows.length === 0}>
              {converting ? 'Añadiendo...' : 'Aceptar'}
            </Button>
          </>
        }>
        <p className="mb-4 text-sm text-[var(--panel-muted)]">¿Añadir como clientes los siguientes contactos?</p>
        <ul className="space-y-1.5">
          {selectedRows.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs text-[var(--acc)]">{c.codigo}</span>
              <span className="font-medium text-white">{c.nombre}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </ModuleGuard>
  );
}
