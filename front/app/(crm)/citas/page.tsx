'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDialog } from '@/components/ui/dialog-provider';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useTenantConfig } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seed, type Cita } from '@/lib/mock/data';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import { NuevaCitaModal } from '@/components/crm/nueva-cita-modal';
import { NuevaEntrenamientoModal } from '@/components/crm/nueva-entrenamiento-modal';
import { NuevaClaseModal } from '@/components/crm/nueva-clase-modal';
import { HoraChips } from '@/components/crm/hora-chips';
import { ServicioSelect, type ServiceOpt } from '@/components/crm/servicio-select';
import { CalendarPlus } from 'lucide-react';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { CITAS_SECTOR_FIELDS, type SectorFieldsDef } from '@/lib/config/citas-sector-fields';
import { ClienteInfoModal } from '@/components/crm/cliente-info-modal';
import { CitaDetalleModal, type CitaConNotas } from '@/components/crm/cita-detalle-modal';
import { AgendaGrid } from '@/components/panel/widgets/agenda-grid';
import { estadoTone, tone, metaFields } from '@/components/agenda/shared';
import { addDays } from '@/lib/utils/calendar';

// Shape que devuelve el back para /bookings paginado.
type CitaApiRow = {
  id: string;
  cliente: string;
  // Nombre COMERCIAL (razón social) del cliente visitado, distinto de la persona de
  // contacto (`cliente`). Ver back/src/routes/bookings.ts.
  clienteComercial?: string | null;
  servicio: string;
  empleado: string;
  fecha: string;
  hora: string;
  estado: string;
  customerId: string | null;
  teamId?: string | null;
  serviceId: string | null;
  employeeId: string | null;
  locationId: string | null;
  recurso?: string | null;
  aforo?: number | null;
  notes?: string | null;
  // Dirección para el pin del detalle (back/src/lib/citaDireccion.ts): cliente
  // visitado si tiene dirección, si no la sucursal (Location.direccion).
  direccion?: string | null;
};

const BASE_FIELDS: Omit<Field, 'render'>[] = [
  { name: 'cliente', label: 'Cliente', required: true },
  { name: 'servicio', label: 'Servicio' },
  { name: 'empleado', label: 'Profesional' },
  { name: 'fecha', label: 'Fecha', type: 'date', required: true },
  { name: 'hora', label: 'Hora', type: 'time' },
  { name: 'estado', label: 'Estado', type: 'select', options: ['Pendiente', 'Confirmada', 'Cancelada', 'Completada'] },
  { name: 'notes', label: 'Notas', type: 'textarea' },
];

// Etiqueta ES del selector "Estado" → enum BookingStatus del back (crm-editar-cita-persistencia).
const ESTADO_TO_STATUS: Record<string, string> = {
  Pendiente: 'PENDING', Confirmada: 'CONFIRMED', Cancelada: 'CANCELLED', Completada: 'COMPLETED',
};

type CitaRow = Cita & Partial<CitaApiRow>;

/** Tarjeta de evento de la agenda full-screen (WU1). Card grande (paridad visual
 * con AppointmentCard de agents-agency); en vista compacta (semana/día) se recorta
 * a hora + cliente pero con letra más grande que el widget del inicio.
 * Click en cualquier parte de la tarjeta (fuera del nombre y de Editar/Eliminar)
 * abre el detalle — mismo comportamiento que AgendaWidget (editarCita). */
function CitaAgendaCard({ c, compact, sector, apiEnabled, onCliente, onOpenDetalle, onEdit, onDelete }: {
  c: CitaRow; compact: boolean; sector?: SectorFieldsDef; apiEnabled: boolean;
  onCliente: (customerId: string) => void; onOpenDetalle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div
      className={compact ? 'cita-full-card cita-full-card-compact' : 'cita-full-card'}
      style={{ borderLeftColor: estadoTone(c.estado) }}
      onClick={onOpenDetalle}
    >
      <div className="time">{c.hora}</div>
      <div className="client">
        {apiEnabled && c.customerId ? (
          <button type="button" className="hover:underline hover:text-[var(--acc)]"
            onClick={(e) => { e.stopPropagation(); onCliente(c.customerId!); }}>
            {c.cliente}
          </button>
        ) : (
          // Cita personal sin cliente vinculado (visita médica, comida, recado…): sin esto
          // la tarjeta quedaba con el bloque de nombre vacío en blanco.
          c.cliente || <span className="text-[var(--panel-muted)]">Personal</span>
        )}
      </div>
      {!compact && (
        <>
          <div className="meta">
            {metaFields(c, sector).map(([label, value]) => `${label}: ${value}`).join(' · ')}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
            <Badge tone={tone(c.estado)}>{c.estado}</Badge>
            <RowActions onEdit={onEdit} onDelete={onDelete} />
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  const term = useTerm('citas', 'Citas');
  const { config } = useTenantConfig();
  const sector = CITAS_SECTOR_FIELDS[config.business.vertical];
  const apiEnabled = isApiEnabled();

  // Modo generador: localStorage / mock.
  const { items: collectionItems, create, update, remove, refresh: collectionRefresh } = useCollection<Cita>('citas', seed);

  // Rango visible del calendario (mes/semana/día) — AgendaGrid lo reporta tras cada
  // navegación. Sin esto, /bookings solo devolvía una página fija de 20 reservas sin
  // filtrar por fecha: cambiar de día en el calendario no traía datos nuevos (bug).
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  // Modo API: paginación server-side, escopada al rango visible del calendario.
  const paged = usePaginatedApi<CitaApiRow>('/bookings', 100, apiEnabled, {
    from: range?.from, to: range?.to,
  });

  // Resumen (Total/Confirmadas/Pendientes): totales GLOBALES del negocio, NO del
  // rango visible. `paged.total`/`displayItems` solo cubren el mes/semana/día en
  // pantalla, así que las citas ya sembradas en otros meses no se contaban (bug
  // reportado). GET /bookings/stats agrega por estado sobre toda la base. Se refresca
  // junto al listado tras crear/editar/borrar.
  const [stats, setStats] = useState<{ total: number; confirmadas: number; pendientes: number } | null>(null);
  const refreshStats = useCallback(() => {
    if (!apiEnabled) return;
    apiFetch<{ total: number; confirmadas: number; pendientes: number }>('/bookings/stats')
      .then((r) => setStats(r))
      .catch(() => setStats(null));
  }, [apiEnabled]);
  useEffect(() => { refreshStats(); }, [refreshStats]);

  const dialog = useDialog();
  const searchParams = useSearchParams();

  // ── Google Calendar (toggle conectar/desconectar, UX igual que AA) ────────────────
  // Desconectado → "📅 Sincronizar Calendar" inicia el OAuth y vuelve a /citas.
  // Conectado    → "✕ Cancelar sincronización" (rojo) revoca la credencial.
  // Al volver del OAuth se hace un sync COMPLETO (trae TODAS las citas de Google).
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [calBusy, setCalBusy] = useState(false);

  useEffect(() => {
    if (!apiEnabled) { setCalendarConnected(false); return; }
    apiFetch<{ items: { servicio: string; estado: string | null }[] }>('/integrations')
      .then((r) => setCalendarConnected(r.items?.some((i) => i.servicio === 'calendar' && i.estado === 'connected') ?? false))
      .catch(() => setCalendarConnected(false));
  }, [apiEnabled]);

  const syncCalendarFull = useCallback(async () => {
    await apiFetch('/integrations/calendar/sync', { method: 'POST' }).catch(() => {});
    paged.refresh();
    refreshStats();
  }, [paged, refreshStats]);

  // Retorno del OAuth (?servicio=calendar&estado=conectado): marca conectado, sincroniza
  // todo y limpia la URL. Espejo del patrón de AA (vuelve a la agenda ya conectado).
  useEffect(() => {
    if (!apiEnabled) return;
    if (searchParams.get('servicio') === 'calendar' && searchParams.get('estado') === 'conectado') {
      setCalendarConnected(true);
      window.history.replaceState(null, '', '/citas');
      void syncCalendarFull().finally(() => void dialog.alert('Google Calendar conectado. Se han importado tus citas.'));
    }
  }, [apiEnabled, searchParams, syncCalendarFull, dialog]);

  const connectCalendar = useCallback(async () => {
    setCalBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>('/integrations/calendar/connect', {
        method: 'POST', body: JSON.stringify({ returnTo: '/citas' }),
      });
      window.location.href = url;
    } catch {
      setCalBusy(false);
      await dialog.alert('No se pudo iniciar la conexión con Google. Inténtalo de nuevo.');
    }
  }, [dialog]);

  const disconnectCalendar = useCallback(async () => {
    const ok = await dialog.confirm({ message: '¿Cancelar la sincronización con Google Calendar?', danger: true });
    if (!ok) return;
    setCalBusy(true);
    try {
      await apiFetch('/integrations/calendar/revoke', { method: 'POST' });
      setCalendarConnected(false);
    } catch {
      await dialog.alert('No se pudo desconectar. Inténtalo de nuevo.');
    } finally {
      setCalBusy(false);
    }
  }, [dialog]);

  const [open, setOpen] = useState(false);
  const [openNueva, setOpenNueva] = useState(false);
  const [editing, setEditing] = useState<(Cita & Partial<Omit<CitaApiRow, 'id'>>) | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  // Detalle de cita al pulsar la tarjeta (paridad con AgendaWidget.editarCita).
  const [detalleId, setDetalleId] = useState<CitaRow['id'] | null>(null);
  // Fallback WU6 (paridad con NuevaCitaModal): si GET /bookings/slots falla al
  // editar, se degrada al <input type="time"> de siempre.
  const [chipsFallback, setChipsFallback] = useState(false);
  // Comentarios cuando el Servicio elegido es "Otros" (paridad con NuevaCitaModal). Vive
  // FUERA de los `values` internos de EntityModal (el campo Servicio solo expone su propio
  // onChange, no uno para un campo hermano) y se pliega en `notes` al enviar (onSubmit).
  const [comentariosOtros, setComentariosOtros] = useState('');

  // Catálogo de servicios para el selector seccionado del editor (modo API). Se pide
  // con limit=100 porque el catálogo real supera las 20 filas por defecto (22 sembradas).
  const [services, setServices] = useState<ServiceOpt[]>([]);
  useEffect(() => {
    if (!apiEnabled) return;
    apiFetch<{ items: ServiceOpt[] }>('/services?limit=100')
      .then((r) => setServices(r.items ?? []))
      .catch(() => setServices([]));
  }, [apiEnabled]);

  // Campos del editor. En modo API:
  //  - "Servicio" pasa de texto plano a un <select> seccionado (ServicioSelect) que
  //    edita el serviceId real; el back revalida disponibilidad al cambiar de servicio.
  //  - "Hora" usa chips de slots reales (igual que NuevaCitaModal), con fallback a
  //    <input type="time"> si el fetch de slots falla o la API no está habilitada.
  // En modo generador/mock se conserva el campo "servicio" de texto (Cita local).
  const FIELDS: Field[] = BASE_FIELDS.flatMap((f) => {
    if (f.name === 'servicio') {
      if (!apiEnabled) return [f];
      return [{
        name: 'serviceId', label: 'Servicio',
        render: ({ value, onChange }) => {
          // "Otros" es una tarea sembrada sin tarifa que no describe por sí misma qué es
          // la cita: revela un input "Comentarios" (paridad con NuevaCitaModal), que vive
          // en `comentariosOtros` (fuera de los `values` de EntityModal) y se pliega en
          // `notes` en onSubmit.
          const seleccionado = services.find((s) => s.id === String(value ?? ''));
          const esOtros = seleccionado?.nombre === 'Otros';
          return (
            <>
              <ServicioSelect className="opera-control" services={services}
                value={String(value ?? '')} onChange={onChange} currentLabel={editing?.servicio} />
              {esOtros && (
                <div className="opera-field mt-2">
                  <label className="opera-label">Comentarios</label>
                  <textarea className="opera-control" rows={2} value={comentariosOtros}
                    placeholder="Describe de qué trata esta cita…"
                    onChange={(e) => setComentariosOtros(e.target.value)} />
                </div>
              )}
            </>
          );
        },
      }];
    }
    if (f.name !== 'hora') return [f];
    return [{
      ...f,
      render: ({ value, onChange, values }) => (
        apiEnabled && !chipsFallback ? (
          <HoraChips
            fecha={String(values.fecha ?? '')}
            serviceId={String(values.serviceId ?? editing?.serviceId ?? '')}
            employeeId={editing?.employeeId ?? undefined}
            locationId={editing?.locationId ?? undefined}
            value={String(value ?? '')}
            onChange={onChange}
            onFallback={() => setChipsFallback(true)}
          />
        ) : (
          <input type="time" className="opera-control" value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)} />
        )
      ),
    }];
  });

  // Items de visualización.
  const displayItems = (apiEnabled ? paged.items : collectionItems) as unknown as (Cita & Partial<CitaApiRow>)[];

  // Deep-link desde el widget Agenda del inicio: /citas?edit=<id> abre la ficha directamente.
  const router = useRouter();
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || apiEnabled) return;
    const found = collectionItems.find((c) => String(c.id) === editId);
    if (found) { setEditing(found); setChipsFallback(false); setOpen(true); router.replace('/citas'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, collectionItems, apiEnabled]);

  // En modo API la edición es real: PATCH /bookings/:id (revalida disponibilidad en el
  // back). Si hay conflicto (409/422), se avisa y el modal queda abierto — nunca se pisa
  // el estado local con un cambio que en realidad no se guardó.
  async function onSubmit(v: Record<string, string | number>) {
    if (apiEnabled && editing) {
      // Mapea la etiqueta ES del selector al enum del back; si no coincide con
      // ninguna opción conocida, no se envía status (el back conserva el actual).
      const status = ESTADO_TO_STATUS[String(v.estado ?? '')];
      let notes = v.notes !== undefined && v.notes !== '' ? String(v.notes) : (editing.notes ?? undefined);
      // Servicio final tras el submit (tocado o no): si resuelve a "Otros" y el usuario
      // escribió un comentario, se añade como segmento más (sin pisar el resto de `notes`
      // — p. ej. Acción/Canal ya presentes se conservan tal cual).
      const serviceIdFinal = v.serviceId ? String(v.serviceId) : editing.serviceId;
      const esOtrosFinal = services.find((s) => s.id === serviceIdFinal)?.nombre === 'Otros';
      if (esOtrosFinal && comentariosOtros.trim()) {
        const segmento = `Comentarios: ${comentariosOtros.trim().replace(/\s*\|\s*/g, ' / ')}`;
        notes = notes ? `${notes} | ${segmento}` : segmento;
      }
      try {
        await apiFetch(`/bookings/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            start: `${v.fecha}T${v.hora}:00`,
            employeeId: editing.employeeId ?? undefined,
            // serviceId editable vía el <select> seccionado; si no se tocó, cae al actual.
            serviceId: serviceIdFinal ?? undefined,
            notes,
            ...(status ? { status } : {}),
          }),
        });
      } catch (err) {
        await dialog.alert(err instanceof Error ? err.message : 'No se pudo guardar la cita.');
        return;
      }
      setOpen(false);
      paged.refresh();
      refreshStats();
      return;
    }
    if (editing) update(editing.id, v as Partial<Cita>); else create(v as unknown as Omit<Cita, 'id'>);
    setOpen(false);
  }
  // En modo CRM el alta es real (selectores por id + disponibilidad, sector-específico); en generador, el modal mock.
  function onNueva() { if (apiEnabled) setOpenNueva(true); else { setEditing(null); setOpen(true); } }

  function onEditar(c: CitaRow) { setEditing(c); setChipsFallback(false); setComentariosOtros(''); setOpen(true); }
  function onEliminar(c: CitaRow) {
    void dialog.confirm({ message: '¿Eliminar?', danger: true }).then(async (ok) => {
      if (!ok) return;
      // En modo API el borrado es REAL (soft delete en DB) + refresco de lista y stats;
      // antes solo tocaba la colección local (localStorage) y en modo API era un no-op.
      if (apiEnabled) {
        try {
          await apiFetch(`/bookings/${c.id}`, { method: 'DELETE' });
          paged.refresh();
          refreshStats();
        } catch (err) {
          await dialog.alert(err instanceof Error ? err.message : 'No se pudo eliminar la cita.');
        }
      } else {
        remove(c.id);
      }
    });
  }

  // Detalle de cita (paridad AgendaWidget): click en tarjeta abre CitaDetalleModal.
  const detalleCita = (displayItems as CitaConNotas[]).find((c) => c.id === detalleId) ?? null;
  async function onGuardarNotas(notes: string) {
    if (!detalleCita) return;
    if (apiEnabled) {
      try {
        await apiFetch(`/bookings/${detalleCita.id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
        paged.refresh();
        refreshStats();
      } catch (err) {
        await dialog.alert(err instanceof Error ? err.message : 'No se pudo guardar la anotación.');
      }
      return;
    }
    update(detalleCita.id, { notes } as unknown as Partial<Cita>);
  }
  // Ya estamos en /citas: "Ir a agenda" del modal abre directamente el formulario de edición.
  function onIrAgendaDesdeDetalle() {
    const c = detalleCita;
    setDetalleId(null);
    if (c) onEditar(c as CitaRow);
  }

  return (
    <ModuleGuard module="citas">
      <div className="panel-fill">
        <PageHeader title={term} subtitle="Agenda y reservas con estados."
          action={
            <div className="flex items-center gap-2">
              {apiEnabled && calendarConnected === true && (
                <Button variant="outline" onClick={disconnectCalendar} disabled={calBusy}
                  className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20">
                  {calBusy ? '…' : '✕ Cancelar sincronización'}
                </Button>
              )}
              {apiEnabled && calendarConnected === false && (
                <Button variant="outline" onClick={connectCalendar} disabled={calBusy}>
                  {calBusy ? 'Conectando…' : '📅 Sincronizar Calendar'}
                </Button>
              )}
              <Button onClick={onNueva}><CalendarPlus className="h-4 w-4" /> Añadir</Button>
            </div>
          } />
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Stat label="Total" value={apiEnabled ? (stats?.total ?? paged.total) : displayItems.length} />
          <Stat label="Confirmadas" value={apiEnabled ? (stats?.confirmadas ?? 0) : displayItems.filter(c => c.estado === 'Confirmada').length} />
          <Stat label="Pendientes" value={apiEnabled ? (stats?.pendientes ?? 0) : displayItems.filter(c => c.estado === 'Pendiente').length} />
        </div>

        {apiEnabled && (
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar cita..." />
        )}

        {/* Vista full-screen — misma gramática que el widget Agenda del inicio (AC1).
            En modo API, el rango se escopa al mes/semana/día visible (onRangeChange). */}
        <AgendaGrid<CitaRow>
          items={displayItems}
          getKey={(c) => c.id}
          emptyLabel={`Sin ${term.toLowerCase()} este día.`}
          sidePanel
          onRangeChange={(from, to) => {
            // `to` de AgendaGrid es inclusivo (último día visible); el back filtra
            // startAt con `lte: new Date(to)`, que parsea a medianoche — sin el +1
            // día, se excluían TODAS las citas del propio día `to` (bug reportado:
            // filtrar por día no mostraba nada agendado ese día).
            const toExclusivo = addDays(to, 1);
            setRange((prev) => (prev?.from === from && prev?.to === toExclusivo ? prev : { from, to: toExclusivo }));
          }}
          renderCard={(c, { compact }) => (
            <CitaAgendaCard
              c={c} compact={compact} sector={sector} apiEnabled={apiEnabled}
              onCliente={setClienteId} onOpenDetalle={() => setDetalleId(c.id)}
              onEdit={() => onEditar(c)} onDelete={() => onEliminar(c)}
            />
          )}
        />

        {apiEnabled && (
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} limit={paged.limit} onChange={paged.setPage} />
        )}
      </div>

      <EntityModal open={open} title={editing ? 'Editar cita' : 'Nueva cita'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />

      <ClienteInfoModal customerId={clienteId} onClose={() => setClienteId(null)} />

      <CitaDetalleModal
        cita={detalleCita}
        onClose={() => setDetalleId(null)}
        onSave={onGuardarNotas}
        onIrAgenda={onIrAgendaDesdeDetalle}
        irAgendaLabel="Editar"
      />

      {sector?.formComponent === 'entrenamiento' && (
        <NuevaEntrenamientoModal open={openNueva} onClose={() => setOpenNueva(false)} onCreated={() => { paged.refresh(); refreshStats(); }} />
      )}
      {sector?.formComponent === 'clase' && (
        <NuevaClaseModal open={openNueva} onClose={() => setOpenNueva(false)} onCreated={() => { paged.refresh(); refreshStats(); }} />
      )}
      {(!sector || sector.formComponent === 'reunion') && (
        <NuevaCitaModal
          open={openNueva}
          mostrarCanal={sector?.formComponent === 'reunion'}
          onClose={() => setOpenNueva(false)}
          onCreated={() => { void collectionRefresh(); paged.refresh(); refreshStats(); }}
        />
      )}
    </ModuleGuard>
  );
}
