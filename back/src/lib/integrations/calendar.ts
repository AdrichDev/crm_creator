// ---------------------------------------------------------------------------
// Google Calendar API del propio negocio (crm-integraciones-comunicacion, WU3).
// Consumidor de getValidToken(): el refresh/lock/reauth vive en oauth.ts; aquí solo
// se construyen las llamadas a la Calendar API (crear / listar / enlazar eventos).
//
// Igual contrato de errores que gmail.ts (T1.6):
//   - Negocio sin Calendar conectado (IntegrationMissingError) → 'missing' (el caller
//     no bloquea su flujo; T3.4 simplemente no crea el evento).
//   - Token muerto en vuelo (401) o refresh fallido → ReauthRequiredError.
//   - 5xx del proveedor → ProviderError (reusa la clase de gmail.ts).
//
// Enlace evento↔reserva (T3.3): en vez de una columna nueva en `reserva`, el vínculo
// se guarda en `extendedProperties.private.crmBookingId` del propio evento de Google
// (metadato privado de la app — patrón estándar de Calendar). Así:
//   - T3.4 crea el evento ya etiquetado con su bookingId → el poller lo reconoce como
//     originado en el CRM y NO lo re-importa como reserva nueva.
//   - Un evento SIN esa etiqueta es externo → el poller crea la reserva y luego
//     escribe la etiqueta de vuelta (write-back) para no duplicarla en la próxima pasada.
// Cero cambios de schema (migración additive trivial) y Google queda como fuente de
// verdad del mapeo, evitando el gotcha de `prisma generate` en Windows.
//
// Deps (getToken + fetch) inyectables → unit-test sin red ni credencial real.
// ---------------------------------------------------------------------------

import {
  getValidToken,
  IntegrationMissingError,
  ReauthRequiredError,
} from './oauth.js';
import { ProviderError } from './gmail.js';
import { emit as defaultEmit } from '../automation/index.js';

/** Calendario primario de la cuenta conectada (el CRM no gestiona calendarios secundarios). */
const CALENDAR_ID = 'primary';
const EVENTS_URL = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`;

/** Clave del metadato privado que enlaza un evento de Google con una reserva del CRM. */
export const CRM_BOOKING_ID_KEY = 'crmBookingId';
export const CRM_BUSINESS_ID_KEY = 'crmBusinessId';

export { ProviderError };

/** Evento a crear en Calendar desde una cita confirmada del CRM (T3.4). */
export interface NewCalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  /** Se graba en extendedProperties.private → el poller reconoce el evento como propio. */
  crmBookingId: string;
  businessId: string;
}

/** Evento tal cual lo devuelve la Calendar API (subconjunto que consume el poller). */
export interface GoogleCalendarEvent {
  id: string;
  status?: string; // confirmed | tentative | cancelled
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/**
 * Resultado de la creación idempotente (WU2): 'created' con el id del evento,
 * 'exists' si ya había un evento activo para ese bookingId (no se duplica),
 * o 'missing' si el negocio no conectó Calendar.
 */
export type CalendarCreateResult =
  | { status: 'missing' }
  | { status: 'created'; eventId: string }
  | { status: 'exists'; eventId: string };

/** Resultado del update (WU2): si el evento no existe en Google, se crea (upsert). */
export type CalendarUpdateResult =
  | { status: 'missing' }
  | { status: 'updated'; eventId: string }
  | { status: 'created'; eventId: string };

/** Resultado del delete (WU2): 'not_found' = ya no hay evento activo (idempotente). */
export type CalendarDeleteResult =
  | { status: 'missing' }
  | { status: 'deleted'; eventId: string }
  | { status: 'not_found' };

/** Puerto inyectable: obtención de token + fetch. */
export interface CalendarDeps {
  getToken(businessId: string): Promise<string>;
  fetch: typeof fetch;
}

function defaultDeps(): CalendarDeps {
  return {
    getToken: (businessId) => getValidToken(businessId, 'calendar'),
    fetch: (...args) => fetch(...args),
  };
}

/** Cuerpo de la Calendar API para un evento nuevo (RFC3339 en UTC). */
function toGoogleEventBody(event: NewCalendarEvent): Record<string, unknown> {
  return {
    summary: event.summary,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
    extendedProperties: {
      private: {
        [CRM_BOOKING_ID_KEY]: event.crmBookingId,
        [CRM_BUSINESS_ID_KEY]: event.businessId,
      },
    },
  };
}

/** Traduce un status HTTP no-OK a la excepción tipada compartida con gmail.ts. */
function throwForStatus(businessId: string, status: number): never {
  if (status === 401) throw new ReauthRequiredError(businessId, 'calendar');
  throw new ProviderError('calendar', `http_${status}`);
}

/**
 * Resuelve el token del negocio. 'missing' (IntegrationMissingError) se traduce a null
 * para que el caller devuelva { status: 'missing' } sin duplicar el try/catch (WU2).
 */
async function resolveToken(businessId: string, deps: CalendarDeps): Promise<string | null> {
  try {
    return await deps.getToken(businessId);
  } catch (e) {
    if (e instanceof IntegrationMissingError) return null;
    throw e; // ReauthRequiredError u otro → lo maneja el caller
  }
}

/**
 * Busca el evento ACTIVO (no cancelado) enlazado a un bookingId vía la etiqueta privada
 * crmBookingId (WU2). Es la base de la idempotencia: create/update/delete consultan aquí
 * antes de actuar, así reintentos o dobles llamadas nunca duplican eventos en Google.
 */
async function findActiveEventByBookingId(
  businessId: string,
  token: string,
  bookingId: string,
  fetchFn: typeof fetch,
): Promise<GoogleCalendarEvent | null> {
  const params = new URLSearchParams({
    privateExtendedProperty: `${CRM_BOOKING_ID_KEY}=${bookingId}`,
    singleEvents: 'true',
    maxResults: '10',
  });
  const res = await fetchFn(`${EVENTS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throwForStatus(businessId, res.status);
  const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return (data.items ?? []).find((e) => e.status !== 'cancelled') ?? null;
}

/** POST del evento a la Calendar API (núcleo compartido por create y el upsert de update). */
async function postEvent(
  event: NewCalendarEvent,
  token: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const res = await fetchFn(EVENTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toGoogleEventBody(event)),
  });
  if (!res.ok) throwForStatus(event.businessId, res.status);
  const data = (await res.json()) as { id?: string };
  return data.id ?? '';
}

/**
 * Crea un evento en el Calendar conectado del negocio (T3.4 + WU2 idempotencia).
 * IDEMPOTENTE por bookingId: si ya existe un evento activo con esa etiqueta, NO crea
 * otro — devuelve 'exists' con el eventId encontrado. Devuelve 'missing' si el negocio
 * no conectó Calendar. Lanza ReauthRequiredError (token muerto) o ProviderError (5xx) —
 * el caller (bookings.ts) los absorbe como soft-fail, sin romper la confirmación.
 */
export async function createCalendarEvent(
  event: NewCalendarEvent,
  deps: CalendarDeps = defaultDeps(),
): Promise<CalendarCreateResult> {
  const token = await resolveToken(event.businessId, deps);
  if (token == null) return { status: 'missing' };

  const existing = await findActiveEventByBookingId(
    event.businessId, token, event.crmBookingId, deps.fetch,
  );
  if (existing) return { status: 'exists', eventId: existing.id };

  const eventId = await postEvent(event, token, deps.fetch);
  return { status: 'created', eventId };
}

/**
 * Actualiza el evento enlazado a un bookingId (WU2). Busca primero el eventId en Google
 * por la etiqueta crmBookingId; si existe → PATCH con los datos nuevos; si NO existe
 * (evento borrado a mano o create fallido en su día) → lo crea (upsert), garantizando
 * que la edición siempre queda reflejada en el Calendar del tenant (AC2).
 */
export async function updateCalendarEvent(
  event: NewCalendarEvent,
  deps: CalendarDeps = defaultDeps(),
): Promise<CalendarUpdateResult> {
  const token = await resolveToken(event.businessId, deps);
  if (token == null) return { status: 'missing' };

  const existing = await findActiveEventByBookingId(
    event.businessId, token, event.crmBookingId, deps.fetch,
  );
  if (!existing) {
    const eventId = await postEvent(event, token, deps.fetch);
    return { status: 'created', eventId };
  }

  const res = await deps.fetch(`${EVENTS_URL}/${encodeURIComponent(existing.id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toGoogleEventBody(event)),
  });
  if (!res.ok) throwForStatus(event.businessId, res.status);
  return { status: 'updated', eventId: existing.id };
}

/**
 * Elimina el evento enlazado a un bookingId (WU2). Busca primero el eventId en Google;
 * si no hay evento activo → 'not_found' (idempotente: borrar dos veces no falla).
 * 404/410 del DELETE (evento ya borrado en vuelo) también cuentan como eliminado.
 */
export async function deleteCalendarEvent(
  businessId: string,
  bookingId: string,
  deps: CalendarDeps = defaultDeps(),
): Promise<CalendarDeleteResult> {
  const token = await resolveToken(businessId, deps);
  if (token == null) return { status: 'missing' };

  const existing = await findActiveEventByBookingId(businessId, token, bookingId, deps.fetch);
  if (!existing) return { status: 'not_found' };

  const res = await deps.fetch(`${EVENTS_URL}/${encodeURIComponent(existing.id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404/410: otro actor lo borró entre la búsqueda y el DELETE → el objetivo se cumplió.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throwForStatus(businessId, res.status);
  }
  return { status: 'deleted', eventId: existing.id };
}

/** Opciones de listado del poller (ventana temporal para no traer todo el calendario). */
export interface ListEventsOptions {
  /** Solo eventos modificados desde esta fecha (RFC3339). Reduce el volumen por pasada. */
  updatedMin?: Date;
  /** Máximo de eventos por pasada (default 250, tope de la API). */
  maxResults?: number;
}

/**
 * Lista eventos del Calendar conectado usando un token ya resuelto (el poller obtiene el
 * token una vez por negocio y reutiliza la conexión). `showDeleted=true` para detectar
 * cancelaciones; `singleEvents=true` para expandir recurrencias a instancias concretas.
 * Lanza ReauthRequiredError/ProviderError igual que el resto (el poller lo captura).
 */
export async function listCalendarEventsWithToken(
  businessId: string,
  token: string,
  opts: ListEventsOptions = {},
  deps: Pick<CalendarDeps, 'fetch'> = { fetch: (...a) => fetch(...a) },
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    singleEvents: 'true',
    showDeleted: 'true',
    orderBy: 'updated',
    maxResults: String(opts.maxResults ?? 250),
  });
  if (opts.updatedMin) params.set('updatedMin', opts.updatedMin.toISOString());

  const res = await deps.fetch(`${EVENTS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throwForStatus(businessId, res.status);
  const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return data.items ?? [];
}

/**
 * Escribe el vínculo crmBookingId en un evento externo ya importado (write-back), para
 * que la próxima pasada del poller lo reconozca como propio y no lo duplique. Best-effort:
 * lanza en error para que el caller decida (el poller lo captura y sigue).
 */
export async function linkEventToBookingWithToken(
  businessId: string,
  token: string,
  eventId: string,
  bookingId: string,
  deps: Pick<CalendarDeps, 'fetch'> = { fetch: (...a) => fetch(...a) },
): Promise<void> {
  const res = await deps.fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extendedProperties: {
        private: { [CRM_BOOKING_ID_KEY]: bookingId, [CRM_BUSINESS_ID_KEY]: businessId },
      },
    }),
  });
  if (!res.ok) throwForStatus(businessId, res.status);
}

// ── T3.4: crear evento al confirmar la cita (soft-fail + telemetría) ──────────

/** Datos de negocio de una cita confirmada a reflejar en el Calendar del negocio. */
export interface BookingCalendarData {
  businessId: string;
  bookingId: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
}

/** Dependencias inyectables del hook de confirmación (sin red ni emit real en tests). */
export interface BookingCalendarDeps {
  createEvent: typeof createCalendarEvent;
  emit: typeof defaultEmit;
}

function defaultBookingCalendarDeps(): BookingCalendarDeps {
  return { createEvent: createCalendarEvent, emit: defaultEmit };
}

/**
 * Telemetría compartida de los hooks soft-fail (Decisión 6): traduce la excepción a su
 * evento de integración. La telemetría en sí nunca lanza (try/catch interno).
 */
async function reportCalendarFailure(
  businessId: string,
  bookingId: string,
  accion: string,
  err: unknown,
  emit: typeof defaultEmit,
): Promise<void> {
  try {
    if (err instanceof ReauthRequiredError) {
      await emit('integracion.reauth_requerido', { servicio: 'calendar' }, { businessId });
    } else if (err instanceof ProviderError) {
      await emit('integracion.fallo_proveedor', { servicio: 'calendar', codigo: err.codigo }, { businessId });
    } else {
      await emit('integracion.fallo_proveedor', { servicio: 'calendar', codigo: 'error' }, { businessId });
    }
  } catch {
    // La telemetría nunca rompe el flujo de la cita.
  }
  console.warn(`[calendar] no se pudo ${accion} el evento (business=${businessId}, booking=${bookingId}): ${(err as Error).name}`);
}

/** Mapea BookingCalendarData al shape del evento de la Calendar API. */
function toNewCalendarEvent(data: BookingCalendarData): NewCalendarEvent {
  return {
    summary: data.summary,
    description: data.description,
    location: data.location,
    start: data.start,
    end: data.end,
    crmBookingId: data.bookingId,
    businessId: data.businessId,
  };
}

/**
 * Crea el evento en el Calendar conectado del negocio al confirmar una cita (T3.4 + WU2).
 * SIEMPRE soft-fail: el fallo de creación NUNCA bloquea la confirmación de la cita
 * (regla de negocio: integración caída no rompe el flujo). Devuelve true si el evento
 * quedó en Google ('created' o 'exists' — idempotencia por bookingId). 'missing'
 * (negocio sin Calendar) → false silencioso; Reauth/Provider → telemetría + false.
 * Nunca lanza.
 */
export async function createBookingCalendarEvent(
  data: BookingCalendarData,
  deps: BookingCalendarDeps = defaultBookingCalendarDeps(),
): Promise<boolean> {
  try {
    const result = await deps.createEvent(toNewCalendarEvent(data));
    return result.status === 'created' || result.status === 'exists';
  } catch (err) {
    await reportCalendarFailure(data.businessId, data.bookingId, 'crear', err, deps.emit);
    return false;
  }
}

/** Dependencias inyectables del hook de edición (WU2). */
export interface UpdateBookingCalendarDeps {
  updateEvent: typeof updateCalendarEvent;
  emit: typeof defaultEmit;
}

/**
 * Refleja la edición de una cita (reprogramación, servicio, notas) en el Calendar del
 * negocio (WU2, AC2). Upsert: si el evento no existe en Google, se crea. SIEMPRE
 * soft-fail — nunca lanza ni bloquea el PATCH. true si el evento quedó actualizado/creado.
 */
export async function updateBookingCalendarEvent(
  data: BookingCalendarData,
  deps: UpdateBookingCalendarDeps = { updateEvent: updateCalendarEvent, emit: defaultEmit },
): Promise<boolean> {
  try {
    const result = await deps.updateEvent(toNewCalendarEvent(data));
    return result.status === 'updated' || result.status === 'created';
  } catch (err) {
    await reportCalendarFailure(data.businessId, data.bookingId, 'actualizar', err, deps.emit);
    return false;
  }
}

/** Dependencias inyectables del hook de cancelación (WU2). */
export interface CancelBookingCalendarDeps {
  deleteEvent: typeof deleteCalendarEvent;
  emit: typeof defaultEmit;
}

/**
 * Elimina del Calendar del negocio el evento de una cita cancelada o borrada (WU2, AC2).
 * SIEMPRE soft-fail — nunca lanza ni bloquea la cancelación. true si ya no queda evento
 * activo en Google ('deleted' o 'not_found' — cancelar dos veces es idempotente).
 */
export async function cancelBookingCalendarEvent(
  data: { businessId: string; bookingId: string },
  deps: CancelBookingCalendarDeps = { deleteEvent: deleteCalendarEvent, emit: defaultEmit },
): Promise<boolean> {
  try {
    const result = await deps.deleteEvent(data.businessId, data.bookingId);
    return result.status === 'deleted' || result.status === 'not_found';
  } catch (err) {
    await reportCalendarFailure(data.businessId, data.bookingId, 'eliminar', err, deps.emit);
    return false;
  }
}
