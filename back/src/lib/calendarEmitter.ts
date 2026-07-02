import { emit as defaultEmit } from './automation/index.js';
import { env } from '../env.js';

// ---------------------------------------------------------------------------
// Emisor de push a Google Calendar (crm-citas-google-calendar, WU3.1).
// Mismo patrón que notify.ts: puerto soft-fail sobre emit() (n8n), nunca lanza.
// Opt-in por usuario (calendarPushEnabled): sin toggle activo, cero llamadas.
// eventId idempotente = uid (booking-{id}@crm / reminder-{id}@crm) — reintentar
// el mismo ítem no genera duplicados en n8n (dedupe por eventId, patrón existente).
// ---------------------------------------------------------------------------

/** Datos de negocio de un ítem de agenda a empujar al calendario del usuario. */
export interface CalendarPushData {
  /** UID iCal estable — el mismo que usa el feed ICS para esta entidad. */
  uid: string;
  businessId: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  direccion?: string;
}

/** Dependencias inyectables (permite testear sin red real). */
export interface CalendarEmitterDeps {
  emit: typeof defaultEmit;
}

function defaultDeps(): CalendarEmitterDeps {
  return { emit: defaultEmit };
}

/** emit() es soft-fail: 'sent' o 'duplicate' (idempotente) cuentan como despachado. */
function emitDispatched(result: Awaited<ReturnType<typeof defaultEmit>>): boolean {
  return result.status === 'sent' || (result.status === 'skipped' && result.reason === 'duplicate');
}

/**
 * Emite el evento `calendar.event_push` a n8n. SIEMPRE soft-fail (nunca lanza):
 * si el webhook no está configurado o falla, devuelve false y el caller no bloquea
 * su operación de negocio (regla de negocio del riesgo "integración externa caída").
 */
export async function pushCalendarEvent(
  data: CalendarPushData,
  deps: CalendarEmitterDeps = defaultDeps(),
): Promise<boolean> {
  const result = await deps.emit(
    'calendar.event_push',
    {
      uid: data.uid,
      titulo: data.titulo,
      inicio: data.inicio.toISOString(),
      fin: data.fin.toISOString(),
      direccion: data.direccion,
    },
    {
      businessId: data.businessId,
      eventId: data.uid,
      // Webhook dedicado del workflow crm-calendar-push (Google Calendar), distinto
      // del dispatcher de emails. Vacío → emit() responde 'disabled' (soft-fail).
      url: env.calendarWebhookUrl,
    },
  );
  return emitDispatched(result);
}

/**
 * Empuja el ítem SOLO si el usuario tiene el toggle "enviar a mi calendario"
 * activo (regla de negocio 10: nada se envía sin opt-in explícito). Con el
 * toggle apagado, cero llamadas a emit() — ni siquiera se construye el payload.
 */
export async function maybePushCalendarEvent(
  pushEnabled: boolean,
  data: CalendarPushData,
  deps: CalendarEmitterDeps = defaultDeps(),
): Promise<boolean> {
  if (!pushEnabled) return false;
  return pushCalendarEvent(data, deps);
}
