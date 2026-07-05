'use client';
import { useEffect, useState } from 'react';
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
import { CalendarPlus } from 'lucide-react';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { CITAS_SECTOR_FIELDS, type SectorFieldsDef } from '@/lib/config/citas-sector-fields';
import { DOW_FULL } from '@/lib/config/constants';
import { ClienteInfoModal } from '@/components/crm/cliente-info-modal';
import { AgendaGrid } from '@/components/panel/widgets/agenda-grid';

// Shape que devuelve el back para /bookings paginado.
type CitaApiRow = {
  id: string;
  cliente: string;
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

/** "Canal: Videollamada" en notes → "Videollamada". Ver Open Question crm-citas-por-sector. */
function extractCanal(notes?: string | null): string {
  const m = notes?.match(/Canal:\s*(.+)/);
  return m?.[1]?.trim() ?? '—';
}

function diaSemanaLabel(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return DOW_FULL[(dt.getDay() + 6) % 7];
}

const tone = (s: string) => s === 'Confirmada' ? 'green' : s === 'Pendiente' ? 'amber' : s === 'Completada' ? 'blue' : 'red';
// Mismo mapeo de color que AgendaWidget (borde izquierdo de la tarjeta) — paridad visual AC1.
const estadoTone = (s: string) => (s === 'Completada' ? '#6aa8ff' : s === 'Cancelada' ? '#ff4757' : 'var(--acc)');

type CitaRow = Cita & Partial<CitaApiRow>;

/** Metadatos secundarios de la tarjeta según el vertical — equivalente a las columnas
 * extra de la tabla que sustituye (crm-citas-por-sector), sin repetir cliente/estado. */
function metaFields(c: CitaRow, sector?: SectorFieldsDef): [string, string][] {
  if (sector?.formComponent === 'entrenamiento') {
    return [['Campo', c.recurso ?? '—'], ['Día', diaSemanaLabel(c.fecha)], ['Entrenador', c.empleado || '—']];
  }
  if (sector?.formComponent === 'clase') {
    return [['Instructor', c.empleado || '—'], ['Sala', c.recurso ?? '—'], ['Día', diaSemanaLabel(c.fecha)], ['Aforo', String(c.aforo ?? '—')]];
  }
  if (sector?.formComponent === 'reunion') {
    return [['Comercial', c.empleado || '—'], ['Canal', extractCanal(c.notes)]];
  }
  return [['Servicio', c.servicio || '—'], ['Profesional', c.empleado || '—']];
}

/** Tarjeta de evento de la agenda full-screen (WU1). En vista compacta (semana/día)
 * se recorta a hora + cliente, igual que AgendaWidget. */
function CitaAgendaCard({ c, compact, sector, apiEnabled, onCliente, onEdit, onDelete }: {
  c: CitaRow; compact: boolean; sector?: SectorFieldsDef; apiEnabled: boolean;
  onCliente: (customerId: string) => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div
      className={compact ? 'appointment-card appointment-card-compact' : 'appointment-card'}
      style={{ borderLeftColor: estadoTone(c.estado) }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="time">{c.hora}</div>
      <div className="client">
        {apiEnabled && c.customerId ? (
          <button type="button" className="hover:underline hover:text-[var(--acc)]" onClick={() => onCliente(c.customerId!)}>
            {c.cliente}
          </button>
        ) : c.cliente}
      </div>
      {!compact && (
        <>
          <div className="meta">
            {metaFields(c, sector).map(([label, value]) => `${label}: ${value}`).join(' · ')}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
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

  // Modo API: paginación server-side.
  const paged = usePaginatedApi<CitaApiRow>('/bookings', 20, apiEnabled);

  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [openNueva, setOpenNueva] = useState(false);
  const [editing, setEditing] = useState<(Cita & Partial<Omit<CitaApiRow, 'id'>>) | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  // Fallback WU6 (paridad con NuevaCitaModal): si GET /bookings/slots falla al
  // editar, se degrada al <input type="time"> de siempre.
  const [chipsFallback, setChipsFallback] = useState(false);

  // Campo "hora" del editor: chips de slots reales (igual que NuevaCitaModal) en modo
  // API; input de hora plano si la API no está habilitada o si el fetch de slots falló.
  const FIELDS: Field[] = BASE_FIELDS.map((f) => f.name !== 'hora' ? f : {
    ...f,
    render: ({ value, onChange, values }) => (
      apiEnabled && !chipsFallback ? (
        <HoraChips
          fecha={String(values.fecha ?? '')}
          serviceId={editing?.serviceId ?? ''}
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
  });

  // Items de visualización.
  const displayItems = (apiEnabled ? paged.items : collectionItems) as unknown as (Cita & Partial<CitaApiRow>)[];

  // Deep-link desde el widget Agenda del inicio: /citas?edit=<id> abre la ficha directamente.
  const searchParams = useSearchParams();
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
      const notes = v.notes !== undefined && v.notes !== '' ? String(v.notes) : (editing.notes ?? undefined);
      try {
        await apiFetch(`/bookings/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            start: `${v.fecha}T${v.hora}:00`,
            employeeId: editing.employeeId ?? undefined,
            serviceId: editing.serviceId ?? undefined,
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
      return;
    }
    if (editing) update(editing.id, v as Partial<Cita>); else create(v as unknown as Omit<Cita, 'id'>);
    setOpen(false);
  }
  // En modo CRM el alta es real (selectores por id + disponibilidad, sector-específico); en generador, el modal mock.
  function onNueva() { if (apiEnabled) setOpenNueva(true); else { setEditing(null); setOpen(true); } }

  function onEditar(c: CitaRow) { setEditing(c); setChipsFallback(false); setOpen(true); }
  function onEliminar(c: CitaRow) {
    void dialog.confirm({ message: '¿Eliminar?', danger: true }).then((ok) => { if (ok) remove(c.id); });
  }

  return (
    <ModuleGuard module="citas">
      <div className="panel-fill">
        <PageHeader title={term} subtitle="Agenda y reservas con estados."
          action={<Button onClick={onNueva}><CalendarPlus className="h-4 w-4" /> Añadir</Button>} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Total" value={apiEnabled ? paged.total : displayItems.length} />
          <Stat label="Confirmadas" value={displayItems.filter(c => c.estado === 'Confirmada').length} />
          <Stat label="Pendientes" value={displayItems.filter(c => c.estado === 'Pendiente').length} />
        </div>

        {apiEnabled && (
          <SearchInput value={paged.search} onChange={paged.setSearch} placeholder="Buscar cita..." />
        )}

        {/* Vista full-screen — misma gramática que el widget Agenda del inicio (AC1).
            En modo API, el rango visible sigue siendo la página paginada actual de
            /bookings (20 ítems); mostrar el mes/rango completo queda para WU2
            (calendar CRUD, ver design.md). */}
        <AgendaGrid<CitaRow>
          items={displayItems}
          getKey={(c) => c.id}
          emptyLabel={`Sin ${term.toLowerCase()} este día.`}
          renderCard={(c, { compact }) => (
            <CitaAgendaCard
              c={c} compact={compact} sector={sector} apiEnabled={apiEnabled}
              onCliente={setClienteId} onEdit={() => onEditar(c)} onDelete={() => onEliminar(c)}
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

      {sector?.formComponent === 'entrenamiento' && (
        <NuevaEntrenamientoModal open={openNueva} onClose={() => setOpenNueva(false)} onCreated={() => paged.refresh()} />
      )}
      {sector?.formComponent === 'clase' && (
        <NuevaClaseModal open={openNueva} onClose={() => setOpenNueva(false)} onCreated={() => paged.refresh()} />
      )}
      {(!sector || sector.formComponent === 'reunion') && (
        <NuevaCitaModal
          open={openNueva}
          mostrarCanal={sector?.formComponent === 'reunion'}
          onClose={() => setOpenNueva(false)}
          onCreated={() => { void collectionRefresh(); paged.refresh(); }}
        />
      )}
    </ModuleGuard>
  );
}
