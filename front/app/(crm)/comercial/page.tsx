'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useProjects, useRole, useTerm } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { isApiEnabled } from '@/lib/api/client';
import { useDialog } from '@/components/ui/dialog-provider';
import { PageHeader, Button, Badge, EmptyState } from '@/components/ui/primitives';
import { MapPin, Upload, UserPlus, LocateFixed, RefreshCw } from 'lucide-react';
import type { ComercialCustomer, VisitStateDto, ReminderDto } from '@/lib/comercial/types';
import { fetchCustomers, fetchVisitStates, createCustomer, fetchReminders, patchReminder, geocodeRerun } from '@/lib/comercial/api';
import { FichaClientePanel } from '@/components/comercial/ficha-cliente-panel';
import { ConfigEstados } from '@/components/comercial/config-estados';
import { ImportClientesModal } from '@/components/comercial/import-clientes-modal';
import { EstadoVisitaBadge } from '@/components/comercial/estado-visita-badge';
import { AbcBadge } from '@/components/comercial/abc-badge';
import { MapaColorSelector } from '@/components/comercial/mapa-color-selector';
import { SeguimientoPanel } from '@/components/comercial/seguimiento-panel';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import type { ColorMode } from '@/lib/comercial/marker-color';
import { loadColorMode, saveColorMode } from '@/lib/comercial/color-mode-storage';
import { buildFollowUpList } from '@/lib/comercial/follow-up';
import { buildRouteUrl } from '@/lib/comercial/maps-link';

const MapaClientes = dynamic(() => import('@/components/comercial/mapa-clientes'), { ssr: false });

type Tab = 'mapa' | 'seguimiento' | 'pendientes' | 'config';

const PROSPECTO_FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'telefono', label: 'Teléfono' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'direccion', label: 'Dirección' },
  { name: 'localidad', label: 'Localidad' },
  { name: 'provincia', label: 'Provincia' },
  { name: 'codigoPostal', label: 'Código postal' },
];

export default function Page() {
  const term = useTerm('comercial', 'Comercial de campo');
  const { role } = useRole();
  const { activeId } = useProjects();
  const puedeEditar = canWrite(role, 'comercial');
  const apiEnabled = isApiEnabled();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useDialog();

  const [tab, setTab] = useState<Tab>('mapa');
  const [states, setStates] = useState<VisitStateDto[]>([]);
  const [customers, setCustomers] = useState<ComercialCustomer[]>([]);
  const [reminders, setReminders] = useState<ReminderDto[]>([]);
  const [selected, setSelected] = useState<ComercialCustomer | null>(null);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [prospectoOpen, setProspectoOpen] = useState(false);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [filters, setFilters] = useState({ estadoVisitaId: '', categoriaAbc: '', tipoRegistro: '', zona: '' });
  const [colorMode, setColorMode] = useState<ColorMode>('estado');

  // Preferencia de modo de color persistida por tenant (comportamiento por defecto = estado, sin regresión).
  useEffect(() => { setColorMode(loadColorMode(activeId)); }, [activeId]);
  function changeColorMode(m: ColorMode) { setColorMode(m); saveColorMode(activeId, m); }

  const load = useCallback(async () => {
    if (!apiEnabled) return;
    setLoading(true);
    try {
      const [st, cs, rs] = await Promise.all([
        fetchVisitStates(),
        fetchCustomers({ ...filters, near: near ?? undefined, limit: 500 }),
        fetchReminders(),
      ]);
      setStates(st);
      setCustomers(cs.items);
      setReminders(rs);
    } finally { setLoading(false); }
  }, [apiEnabled, filters, near]);

  useEffect(() => { void load(); }, [load]);

  // Deep-link desde la campana de notificaciones: /comercial?customerId=<id> abre la ficha.
  useEffect(() => {
    const cid = searchParams.get('customerId');
    if (!cid || customers.length === 0) return;
    const found = customers.find((c) => c.id === cid);
    if (found) { setSelected(found); router.replace('/comercial'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, customers]);

  const geolocated = useMemo(() => customers.filter((c) => c.geoEstado === 'OK'), [customers]);
  const sinGeo = useMemo(() => customers.filter((c) => c.geoEstado !== 'OK'), [customers]);
  const pendientes = useMemo(() => customers.filter((c) => c.estadoVisita?.esPendiente), [customers]);

  const followUpItems = useMemo(() => buildFollowUpList(
    reminders.map((r) => ({ id: r.id, customerId: r.customerId, customerNombre: r.customerNombre, titulo: r.titulo, fechaPrevista: r.fechaPrevista, estado: r.estado })),
    customers.map((c) => ({ id: c.id, nombre: c.nombre, proximaAccionEn: c.proximaAccionEn, estadoVisita: c.estadoVisita })),
  ), [reminders, customers]);

  async function completarSeguimiento(reminderId: string) {
    await patchReminder(reminderId, { estado: 'DONE' });
    await load();
  }
  function abrirFichaSeguimiento(customerId: string) {
    const c = customers.find((x) => x.id === customerId);
    if (c) setSelected(c);
  }
  function routeUrlFor(customerId: string): string | null {
    const c = customers.find((x) => x.id === customerId);
    return c ? buildRouteUrl(c) : null;
  }

  function pedirUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setNear(null),
    );
  }

  // Re-geolocalizar pendientes (crm-geo-real-clientes): re-intenta PENDING/FAILED con
  // dirección contra Nominatim y refresca el mapa con el resultado.
  async function reGeolocalizar() {
    setGeocoding(true);
    try {
      const r = await geocodeRerun(false);
      await dialog.alert(`Geolocalización: ${r.ok} ubicados, ${r.failed} no encontrados, ${r.skipped} sin dirección.`);
      await load();
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'No se pudo re-geolocalizar.');
    } finally {
      setGeocoding(false);
    }
  }

  async function crearProspecto(v: Record<string, string | number>) {
    await createCustomer({ ...v, tipoRegistro: 'PROSPECTO' });
    setProspectoOpen(false);
    void load();
  }

  // Refresca y mantiene la ficha abierta con el dato actualizado.
  const refreshKeepingSelection = useCallback(async () => {
    const cs = await fetchCustomers({ ...filters, near: near ?? undefined, limit: 500 });
    setCustomers(cs.items);
    setSelected((prev) => (prev ? cs.items.find((c) => c.id === prev.id) ?? prev : null));
  }, [filters, near]);

  if (!apiEnabled) {
    return (
      <ModuleGuard module="comercial">
        <PageHeader title={term} subtitle="Mapa geolocalizado, visitas, estados y rutas." />
        <EmptyState title="Módulo conectado al backend" hint="Configura NEXT_PUBLIC_API_URL para operar clientes, visitas y mapa con datos reales." />
      </ModuleGuard>
    );
  }

  const selCls = 'rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-white';

  return (
    <ModuleGuard module="comercial">
      <PageHeader title={term} subtitle="Mapa geolocalizado, visitas, estados y rutas a Google Maps."
        action={puedeEditar ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Importar</Button>
            <Button onClick={() => setProspectoOpen(true)}><UserPlus className="h-4 w-4" /> Prospecto</Button>
          </div>
        ) : undefined} />

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-white/10 text-sm">
        {(['mapa', 'seguimiento', 'pendientes', 'config'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 capitalize ${tab === t ? 'text-white border-b-2 border-[var(--acc)]' : 'text-[var(--panel-muted)]'}`}>
            {t === 'pendientes' ? `Pendientes (${pendientes.length})` : t === 'seguimiento' ? `Seguimiento (${followUpItems.length})` : t}
          </button>
        ))}
      </div>

      {tab === 'mapa' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <select className={selCls} value={filters.estadoVisitaId} onChange={(e) => setFilters({ ...filters, estadoVisitaId: e.target.value })}>
              <option value="">Todos los estados</option>
              {states.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className={selCls} value={filters.categoriaAbc} onChange={(e) => setFilters({ ...filters, categoriaAbc: e.target.value })}>
              <option value="">Toda categoría</option>
              <option value="A">A</option><option value="B">B</option><option value="C">C</option>
            </select>
            <select className={selCls} value={filters.tipoRegistro} onChange={(e) => setFilters({ ...filters, tipoRegistro: e.target.value })}>
              <option value="">Cliente y prospecto</option>
              <option value="CLIENTE">Solo clientes</option>
              <option value="PROSPECTO">Solo prospectos</option>
            </select>
            <input className={selCls} placeholder="Zona (localidad/provincia/CP)" value={filters.zona} onChange={(e) => setFilters({ ...filters, zona: e.target.value })} />
            <Button variant={near ? 'primary' : 'outline'} onClick={near ? () => setNear(null) : pedirUbicacion}>
              <LocateFixed className="h-4 w-4" /> {near ? 'Cercanía activa' : 'Cerca de mí'}
            </Button>
          </div>

          {/* Selector de modo de color + leyenda dinámica (regla 9 / §16.3) */}
          <MapaColorSelector modo={colorMode} onModoChange={changeColorMode} estados={states} />

          <MapaClientes customers={geolocated} selectedId={selected?.id} onSelect={setSelected} center={near ?? undefined} modo={colorMode} />

          {/* Lista lateral / pendientes de geolocalizar */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-white">Clientes en el mapa ({geolocated.length})</h3>
              <ul className="max-h-64 space-y-1 overflow-auto">
                {geolocated.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setSelected(c)} className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm hover:border-[var(--acc)]">
                      <span className="flex-1 text-white">{c.nombre}{c.distanciaKm !== undefined ? <span className="text-xs text-[var(--panel-muted)]"> · {c.distanciaKm} km</span> : null}</span>
                      <EstadoVisitaBadge estado={c.estadoVisita} />
                      <AbcBadge categoria={c.categoriaAbc} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-white"><MapPin className="h-4 w-4 text-red-400" /> Pendientes de geolocalizar ({sinGeo.length})</h3>
                {puedeEditar && sinGeo.length > 0 && (
                  <Button variant="outline" onClick={() => void reGeolocalizar()} disabled={geocoding}>
                    <RefreshCw className={`h-4 w-4 ${geocoding ? 'animate-spin' : ''}`} /> {geocoding ? 'Geolocalizando…' : 'Re-geolocalizar'}
                  </Button>
                )}
              </div>
              <ul className="max-h-64 space-y-1 overflow-auto">
                {sinGeo.length === 0 && <li className="text-sm text-[var(--panel-muted)]">Todos ubicados.</li>}
                {sinGeo.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setSelected(c)} className="flex w-full items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-left text-sm hover:border-red-500/50">
                      <span className="flex-1 text-white">{c.nombre}</span>
                      <Badge tone="red">{c.geoEstado === 'FAILED' ? 'No encontrada' : 'Sin dirección'}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'seguimiento' && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-white">Seguimiento ({followUpItems.length})</h3>
          <SeguimientoPanel items={followUpItems} onCompletar={completarSeguimiento} onAbrirFicha={abrirFichaSeguimiento} getRouteUrl={routeUrlFor} />
        </div>
      )}

      {tab === 'pendientes' && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-white">Clientes pendientes de visitar ({pendientes.length})</h3>
          <ul className="space-y-1">
            {pendientes.length === 0 && <li className="text-sm text-[var(--panel-muted)]">Nada pendiente.</li>}
            {pendientes.map((c) => (
              <li key={c.id}>
                <button onClick={() => setSelected(c)} className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm hover:border-[var(--acc)]">
                  <span className="flex-1 text-white">{c.nombre}</span>
                  <span className="text-xs text-[var(--panel-muted)]">{c.localidad || c.direccion}</span>
                  <EstadoVisitaBadge estado={c.estadoVisita} />
                  <AbcBadge categoria={c.categoriaAbc} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'config' && (
        puedeEditar
          ? <ConfigEstados estados={states} onChanged={load} />
          : <EmptyState title="Sin permisos" hint="Solo administradores pueden configurar estados de visita." />
      )}

      {loading && <p className="mt-4 text-sm text-[var(--panel-muted)]">Cargando…</p>}

      <FichaClientePanel customer={selected} visitStates={states} canWrite={puedeEditar}
        onClose={() => setSelected(null)} onChanged={refreshKeepingSelection} />

      <ImportClientesModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />

      <EntityModal open={prospectoOpen} title="Nuevo prospecto" fields={PROSPECTO_FIELDS}
        initial={null} onSubmit={crearProspecto} onClose={() => setProspectoOpen(false)} />
    </ModuleGuard>
  );
}
