import { prisma as defaultPrisma } from '../prisma.js';
import { BookingStatus } from './generated/prisma/client.js';
import {
  getValidToken,
  IntegrationMissingError,
  ReauthRequiredError,
} from './integrations/oauth.js';
import {
  listCalendarEventsWithToken,
  linkEventToBookingWithToken,
  CRM_BOOKING_ID_KEY,
  type GoogleCalendarEvent,
} from './integrations/calendar.js';

// ---------------------------------------------------------------------------
// Poller de sincronización Google Calendar → crm.reserva (crm-integraciones-
// comunicacion, WU3, T3.3). Ejecuta cada CALENDAR_SYNC_INTERVAL_MS ms (default 5 min).
// Generaliza el patrón del reminderDrainer/digestScheduler: intervalo + DI core.
//
// Por cada credencial de Calendar de TENANT (businessId no null, estado='connected';
// la credencial admin businessId=null NO se sincroniza — no tiene reserva a la que
// mapear, spec.md solo define sync por negocio):
//   1. getValidToken(businessId, 'calendar') — refresh perezoso reutilizado.
//   2. Lista eventos recientes (ventana updatedMin) del calendario primario.
//   3. Concilia cada evento con crm.reserva:
//      - Evento con extendedProperties.private.crmBookingId → originado en el CRM:
//        refleja reprogramación (start/end) o cancelación externa sobre esa reserva.
//      - Evento SIN esa etiqueta → externo: si YA existe una reserva importada para esa
//        misma ventana horaria exacta (mismo servicio marcador, bug MEDIUM revisión WU3:
//        el linkEvent de una pasada previa pudo fallar dejando el evento sin etiquetar),
//        reintenta SOLO el write-back sobre esa reserva. Si no existe, crea la reserva
//        (ubicación por defecto + servicio marcador "Google Calendar") y escribe la
//        etiqueta de vuelta para no duplicarla en la próxima pasada.
//
// TOLERANTE A FALLOS (regla de negocio: integración caída no rompe nada):
//   - Token revocado/caducado (ReauthRequiredError) o ausente → se salta ESA credencial
//     y sigue con las demás; nunca lanza.
//   - Un evento con datos raros no detiene el lote (try/catch por evento).
//   - Errores globales capturados: el proceso Express sigue en pie.
// ---------------------------------------------------------------------------

export const CALENDAR_SYNC_INTERVAL_MS = Number(
  process.env.CALENDAR_SYNC_INTERVAL_MS ?? 5 * 60_000,
);

/** Nombre del servicio marcador donde se cuelgan las reservas importadas de Google. */
export const SYNC_SERVICE_NAME = 'Google Calendar';

// ---------------------------------------------------------------------------
// Puerto DI (facilita testear la conciliación sin DB ni red).
// ---------------------------------------------------------------------------

export interface SyncBookingRow {
  id: string;
  status: string;
}

export interface BookingUpdate {
  startAt?: Date;
  endAt?: Date;
  status?: BookingStatus;
  /** Estado previo, para que la impl de producción registre el historial en un cambio de estado. */
  prevStatus?: string;
}

export interface CreatedBookingInput {
  locationId: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  summary: string;
}

export interface CalendarSyncDeps {
  /** Credenciales Calendar de tenant a sincronizar (businessId no null, connected). */
  listCredentials(): Promise<{ businessId: string }[]>;
  getToken(businessId: string): Promise<string>;
  listEvents(businessId: string, token: string): Promise<GoogleCalendarEvent[]>;
  findBooking(businessId: string, bookingId: string): Promise<SyncBookingRow | null>;
  updateBooking(bookingId: string, data: BookingUpdate): Promise<void>;
  /** Ubicación por defecto + servicio marcador; null si el negocio no tiene ubicación. */
  resolveTarget(businessId: string): Promise<{ locationId: string; serviceId: string } | null>;
  createBooking(businessId: string, input: CreatedBookingInput): Promise<{ id: string }>;
  /** Write-back de la etiqueta crmBookingId sobre el evento externo ya importado. */
  linkEvent(businessId: string, token: string, eventId: string, bookingId: string): Promise<void>;
  /**
   * Idempotencia sin columna nueva: busca una reserva YA importada para esta misma
   * ventana horaria exacta bajo el servicio marcador (mismo businessId+serviceId+
   * startAt+endAt). Si el write-back de linkEvent falló en una pasada anterior, el
   * evento sigue sin etiqueta pero la reserva ya existe — evita duplicarla.
   */
  findImportedBooking(
    businessId: string,
    serviceId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<SyncBookingRow | null>;
}

// ---------------------------------------------------------------------------
// Parseo de eventos de Google.
// ---------------------------------------------------------------------------

/** Fecha de un extremo del evento. null si es evento de día completo (sin dateTime). */
function parseEndpoint(ep: { dateTime?: string; date?: string } | undefined): Date | null {
  if (!ep?.dateTime) return null; // eventos de día completo (date) no mapean a una cita con hora
  const d = new Date(ep.dateTime);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Conciliación de un único evento (núcleo testeable).
// ---------------------------------------------------------------------------

export async function reconcileEvent(
  businessId: string,
  token: string,
  event: GoogleCalendarEvent,
  deps: CalendarSyncDeps,
): Promise<void> {
  const crmBookingId = event.extendedProperties?.private?.[CRM_BOOKING_ID_KEY];
  const isCancelled = event.status === 'cancelled';

  // ── Caso A: evento originado en el CRM (lleva la etiqueta) ──────────────────
  if (crmBookingId) {
    const booking = await deps.findBooking(businessId, crmBookingId);
    if (!booking) return; // reserva borrada en el CRM → nada que conciliar

    if (isCancelled) {
      if (booking.status !== 'CANCELLED') {
        await deps.updateBooking(booking.id, { status: BookingStatus.CANCELLED, prevStatus: booking.status });
      }
      return;
    }

    // Evento activo: refleja una posible reprogramación externa (start/end).
    const startAt = parseEndpoint(event.start);
    const endAt = parseEndpoint(event.end);
    if (startAt && endAt) {
      await deps.updateBooking(booking.id, { startAt, endAt });
    }
    return;
  }

  // ── Caso B: evento externo (sin etiqueta) ──────────────────────────────────
  if (isCancelled) return; // externo y cancelado: nunca lo importamos, nada que hacer

  const startAt = parseEndpoint(event.start);
  const endAt = parseEndpoint(event.end);
  if (!startAt || !endAt) return; // día completo o fechas inválidas → no se importa

  const target = await deps.resolveTarget(businessId);
  if (!target) return; // negocio sin ubicación → no se puede crear reserva (soft-skip)

  // Idempotencia: si el linkEvent de una pasada anterior falló (5xx/rate-limit), el
  // evento sigue llegando sin etiqueta pero la reserva ya fue creada. Reintenta SOLO
  // el write-back en vez de crear una reserva duplicada (bug MEDIUM, revisión WU3).
  const existing = await deps.findImportedBooking(businessId, target.serviceId, startAt, endAt);
  if (existing) {
    try {
      await deps.linkEvent(businessId, token, event.id, existing.id);
    } catch (err) {
      console.warn(
        `[calendar-sync] write-back (retry) falló (business=${businessId}, event=${event.id}):`,
        (err as Error).message,
      );
    }
    return;
  }

  const created = await deps.createBooking(businessId, {
    locationId: target.locationId,
    serviceId: target.serviceId,
    startAt,
    endAt,
    summary: event.summary ?? 'Evento de Google Calendar',
  });

  // Write-back best-effort: si falla, la próxima pasada podría reimportar (se tolera).
  try {
    await deps.linkEvent(businessId, token, event.id, created.id);
  } catch (err) {
    console.warn(
      `[calendar-sync] write-back falló (business=${businessId}, event=${event.id}):`,
      (err as Error).message,
    );
  }
}

// ---------------------------------------------------------------------------
// Sincronización de una credencial (todos sus eventos).
// ---------------------------------------------------------------------------

export async function syncCredential(businessId: string, deps: CalendarSyncDeps): Promise<void> {
  let token: string;
  try {
    token = await deps.getToken(businessId);
  } catch (err) {
    // Token revocado/caducado o credencial ausente: se salta ESTA credencial (soft-fail).
    if (err instanceof ReauthRequiredError || err instanceof IntegrationMissingError) {
      console.warn(`[calendar-sync] credencial no usable (business=${businessId}): ${(err as Error).name}`);
      return;
    }
    console.error(`[calendar-sync] getToken error (business=${businessId}):`, (err as Error).message);
    return;
  }

  let events: GoogleCalendarEvent[];
  try {
    events = await deps.listEvents(businessId, token);
  } catch (err) {
    // 401/5xx del listado → se salta; la próxima pasada reintenta.
    console.warn(`[calendar-sync] list eventos falló (business=${businessId}): ${(err as Error).message}`);
    return;
  }

  for (const event of events) {
    try {
      await reconcileEvent(businessId, token, event, deps);
    } catch (err) {
      console.error(`[calendar-sync] evento ${event.id} (business=${businessId}) falló:`, (err as Error).message);
    }
  }
}

// ---------------------------------------------------------------------------
// Orquestador (testeable con deps inyectadas).
// ---------------------------------------------------------------------------

export async function runCalendarSyncWithDeps(deps: CalendarSyncDeps): Promise<void> {
  try {
    const credentials = await deps.listCredentials();
    for (const { businessId } of credentials) {
      await syncCredential(businessId, deps);
    }
  } catch (err) {
    console.error('[calendar-sync] error global en la pasada:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Dependencias reales (producción) sobre prisma + Calendar API.
// ---------------------------------------------------------------------------

/** Ventana de listado: eventos modificados en las últimas 2 pasadas (margen de solape). */
function updatedMinWindow(now = Date.now()): Date {
  return new Date(now - 2 * CALENDAR_SYNC_INTERVAL_MS);
}

/** Busca (o crea) el servicio marcador donde cuelgan las reservas importadas de Google. */
async function getOrCreateSyncService(businessId: string): Promise<{ id: string }> {
  const existing = await defaultPrisma.service.findFirst({
    where: { businessId, nombre: SYNC_SERVICE_NAME, eliminadoEn: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;
  return defaultPrisma.service.create({
    data: {
      businessId,
      nombre: SYNC_SERVICE_NAME,
      descripcion: 'Reservas importadas automáticamente desde Google Calendar',
      reservableOnline: false,
      requiereProfesional: false,
      activo: true,
    },
    select: { id: true },
  });
}

function buildProdDeps(): CalendarSyncDeps {
  const prisma = defaultPrisma;
  return {
    listCredentials: async () => {
      const rows = await prisma.oAuthCredential.findMany({
        where: { servicio: 'calendar', estado: 'connected', businessId: { not: null } },
        select: { businessId: true },
      });
      return rows
        .filter((r): r is { businessId: string } => r.businessId != null)
        .map((r) => ({ businessId: r.businessId }));
    },
    getToken: (businessId) => getValidToken(businessId, 'calendar'),
    listEvents: (businessId, token) =>
      listCalendarEventsWithToken(businessId, token, { updatedMin: updatedMinWindow() }),
    findBooking: (businessId, bookingId) =>
      prisma.booking.findFirst({
        where: { id: bookingId, businessId, eliminadoEn: null },
        select: { id: true, status: true },
      }),
    updateBooking: async (bookingId, data) => {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          ...(data.startAt ? { startAt: data.startAt } : {}),
          ...(data.endAt ? { endAt: data.endAt } : {}),
          ...(data.status ? { status: data.status } : {}),
        },
      });
      // Historial de cambio de estado (convención del repo: transition() en bookings.ts).
      if (data.status && data.status !== data.prevStatus) {
        await prisma.bookingStatusHistory.create({
          data: {
            bookingId,
            estadoAnterior: (data.prevStatus as BookingStatus | undefined) ?? null,
            estadoNuevo: data.status,
            motivo: 'Sincronización Google Calendar',
          },
        });
      }
    },
    resolveTarget: async (businessId) => {
      const location = await prisma.location.findFirst({
        where: { businessId, activo: true, eliminadoEn: null },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!location) return null;
      const service = await getOrCreateSyncService(businessId);
      return { locationId: location.id, serviceId: service.id };
    },
    createBooking: async (businessId, input) => {
      const booking = await prisma.booking.create({
        data: {
          businessId,
          locationId: input.locationId,
          serviceId: input.serviceId,
          startAt: input.startAt,
          endAt: input.endAt,
          status: BookingStatus.CONFIRMED,
          notes: input.summary,
        },
        select: { id: true },
      });
      await prisma.bookingStatusHistory.create({
        data: { bookingId: booking.id, estadoNuevo: BookingStatus.CONFIRMED, motivo: 'Importada de Google Calendar' },
      });
      return booking;
    },
    linkEvent: (businessId, token, eventId, bookingId) =>
      linkEventToBookingWithToken(businessId, token, eventId, bookingId),
    findImportedBooking: (businessId, serviceId, startAt, endAt) =>
      prisma.booking.findFirst({
        where: { businessId, serviceId, startAt, endAt, eliminadoEn: null },
        select: { id: true, status: true },
      }),
  };
}

async function runCalendarSync(): Promise<void> {
  await runCalendarSyncWithDeps(buildProdDeps());
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Arranca el poller de sincronización de Calendar. Llamar una sola vez desde server.ts
 * tras listen. En tests no llamar (usar runCalendarSyncWithDeps con deps mock).
 */
export function startCalendarSync(): void {
  console.log(`[calendar-sync] iniciado (intervalo ${CALENDAR_SYNC_INTERVAL_MS} ms)`);
  _intervalId = setInterval(() => { void runCalendarSync(); }, CALENDAR_SYNC_INTERVAL_MS);
  if (_intervalId.unref) _intervalId.unref();
}
