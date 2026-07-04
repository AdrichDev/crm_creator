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

/** 'created' con el id del evento, o 'missing' si el negocio no conectó Calendar. */
export type CalendarCreateResult =
  | { status: 'missing' }
  | { status: 'created'; eventId: string };

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
 * Crea un evento en el Calendar conectado del negocio (T3.4). Devuelve 'missing' si el
 * negocio no conectó Calendar. Lanza ReauthRequiredError (token muerto) o ProviderError
 * (5xx) — el caller (bookings.ts) los absorbe como soft-fail, sin romper la confirmación.
 */
export async function createCalendarEvent(
  event: NewCalendarEvent,
  deps: CalendarDeps = defaultDeps(),
): Promise<CalendarCreateResult> {
  let token: string;
  try {
    token = await deps.getToken(event.businessId);
  } catch (e) {
    if (e instanceof IntegrationMissingError) return { status: 'missing' };
    throw e; // ReauthRequiredError u otro → lo maneja el caller
  }

  const res = await deps.fetch(EVENTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toGoogleEventBody(event)),
  });

  if (!res.ok) throwForStatus(event.businessId, res.status);
  const data = (await res.json()) as { id?: string };
  return { status: 'created', eventId: data.id ?? '' };
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
 * Crea el evento en el Calendar conectado del negocio al confirmar una cita (T3.4).
 * SIEMPRE soft-fail: el fallo de creación NUNCA bloquea la confirmación de la cita
 * (regla de negocio: integración caída no rompe el flujo). Devuelve true solo si se
 * creó el evento. 'missing' (negocio sin Calendar) → false silencioso; Reauth/Provider
 * → telemetría (Decisión 6) + false. Nunca lanza.
 */
export async function createBookingCalendarEvent(
  data: BookingCalendarData,
  deps: BookingCalendarDeps = defaultBookingCalendarDeps(),
): Promise<boolean> {
  try {
    const result = await deps.createEvent({
      summary: data.summary,
      description: data.description,
      location: data.location,
      start: data.start,
      end: data.end,
      crmBookingId: data.bookingId,
      businessId: data.businessId,
    });
    return result.status === 'created';
  } catch (err) {
    try {
      if (err instanceof ReauthRequiredError) {
        await deps.emit('integracion.reauth_requerido', { servicio: 'calendar' }, { businessId: data.businessId });
      } else if (err instanceof ProviderError) {
        await deps.emit('integracion.fallo_proveedor', { servicio: 'calendar', codigo: err.codigo }, { businessId: data.businessId });
      } else {
        await deps.emit('integracion.fallo_proveedor', { servicio: 'calendar', codigo: 'error' }, { businessId: data.businessId });
      }
    } catch {
      // La telemetría nunca rompe el flujo de la cita.
    }
    console.warn(`[calendar] no se pudo crear el evento (business=${data.businessId}, booking=${data.bookingId}): ${(err as Error).name}`);
    return false;
  }
}
