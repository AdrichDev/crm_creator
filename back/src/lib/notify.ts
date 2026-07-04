import { env } from '../env.js';
import { emit as defaultEmit } from './automation/index.js';
import type { BookingEventData } from './automation/index.js';
import {
  sendEmail as defaultSendEmail,
  confirmedTemplate,
  reminderTemplate,
  noShowTemplate,
} from './email.js';
import { sendGmailMessage, ProviderError } from './integrations/gmail.js';
import type { GmailMessage, GmailSendResult } from './integrations/gmail.js';
import { ReauthRequiredError } from './integrations/oauth.js';

// ---------------------------------------------------------------------------
// Puerto de notificación de citas con fallback.
// Regla (una sola vía activa por despliegue → sin emails dobles):
//   - AUTOMATION_WEBHOOK_URL configurada → emit(evento) a n8n (canales escalables).
//   - Vacía → sendEmail directo con la plantilla actual (comportamiento de HOY).
// SIEMPRE soft-fail: devuelve true si se despachó, false si no; nunca lanza.
// La decisión emit-vs-SMTP vive aquí y SOLO aquí (drainer y bookings la reutilizan).
// ---------------------------------------------------------------------------

/** Datos de negocio que necesita cualquier notificación de cita. */
export interface BookingNotifyData {
  bookingId: string;
  businessId: string;
  businessName: string;
  customerName: string;
  email: string;
  serviceName: string;
  employeeName?: string;
  startsAt: Date;
}

/** Dependencias inyectables (permite testear ambas vías sin red ni SMTP real). */
export interface NotifyDeps {
  webhookUrl: string;
  emit: typeof defaultEmit;
  sendEmail: typeof defaultSendEmail;
  /**
   * Envío por el Gmail conectado del negocio (crm-integraciones-comunicacion, T1.6).
   * Opcional: si falta (tests que no ejercen Gmail), se omite y se usa SMTP directo,
   * preservando el comportamiento previo. Solo actúa en la vía SMTP (webhook vacío):
   * cuando n8n está activo, la mensajería la enruta n8n (no se duplica el email).
   */
  sendViaGmail?: (businessId: string, msg: GmailMessage) => Promise<GmailSendResult>;
}

function defaultDeps(): NotifyDeps {
  return {
    webhookUrl: env.automationWebhookUrl,
    emit: defaultEmit,
    sendEmail: defaultSendEmail,
    sendViaGmail: sendGmailMessage,
  };
}

/** Traduce un fallo de Gmail a telemetría (soft-fail) antes de caer a SMTP. */
async function reportGmailFailure(deps: NotifyDeps, businessId: string, err: unknown): Promise<void> {
  try {
    if (err instanceof ReauthRequiredError) {
      await deps.emit('integracion.reauth_requerido', { servicio: 'gmail' }, { businessId });
    } else if (err instanceof ProviderError) {
      await deps.emit('integracion.fallo_proveedor', { servicio: 'gmail', codigo: err.codigo }, { businessId });
    } else {
      await deps.emit('integracion.fallo_proveedor', { servicio: 'gmail', codigo: 'error' }, { businessId });
    }
  } catch {
    // La telemetría nunca rompe el envío: si emit lanza, se ignora.
  }
  console.warn(`[notify] Gmail no disponible, fallback a SMTP (business=${businessId}): ${(err as Error).name}`);
}

/**
 * Vía de email directo (webhook vacío): prefiere el Gmail conectado del negocio y cae
 * a SMTP si no está conectado ('missing'), si requiere reconexión (ReauthRequiredError)
 * o si el proveedor falla (ProviderError). NUNCA lanza — la telemetría y SMTP absorben.
 */
async function deliverDirectEmail(deps: NotifyDeps, businessId: string, msg: GmailMessage): Promise<boolean> {
  if (deps.sendViaGmail) {
    try {
      const result = await deps.sendViaGmail(businessId, msg);
      if (result === 'sent') return true;
      // 'missing' → el negocio no conectó Gmail: cae a SMTP sin ruido de telemetría.
    } catch (err) {
      await reportGmailFailure(deps, businessId, err);
      // fall-through a SMTP.
    }
  }
  return deps.sendEmail(msg);
}

/** Formatea fecha/hora en es-ES igual que las plantillas de email. */
function formatFechaHora(startsAt: Date): { fecha: string; hora: string } {
  return {
    fecha: startsAt.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    hora: startsAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Convierte los datos de negocio al payload del evento (PII mínima, fecha/hora ya formateadas). */
function toEventData(data: BookingNotifyData): BookingEventData {
  const { fecha, hora } = formatFechaHora(data.startsAt);
  return {
    bookingId: data.bookingId,
    businessName: data.businessName,
    customerName: data.customerName,
    email: data.email,
    serviceName: data.serviceName,
    employeeName: data.employeeName,
    fecha,
    hora,
  };
}

/** emit() es soft-fail: 'sent' o un 'duplicate' idempotente cuentan como despachado. */
function emitDispatched(result: Awaited<ReturnType<typeof defaultEmit>>): boolean {
  return result.status === 'sent' || (result.status === 'skipped' && result.reason === 'duplicate');
}

/**
 * Confirmación de reserva. eventId = `${bookingId}:confirmed` (idempotente).
 */
export async function notifyBookingConfirmed(
  data: BookingNotifyData,
  deps: NotifyDeps = defaultDeps(),
): Promise<boolean> {
  try {
    if (deps.webhookUrl) {
      const r = await deps.emit('booking.confirmed', toEventData(data), {
        businessId: data.businessId,
        eventId: `${data.bookingId}:confirmed`,
      });
      return emitDispatched(r);
    }
    const html = confirmedTemplate({
      customerName: data.customerName,
      serviceName: data.serviceName,
      startsAt: data.startsAt,
      employeeName: data.employeeName,
      businessName: data.businessName,
    });
    return await deliverDirectEmail(deps, data.businessId, {
      to: data.email,
      subject: `Cita confirmada — ${data.serviceName || 'tu servicio'}`,
      html,
    });
  } catch (err) {
    console.error(`[notify] booking.confirmed soft-fail (${data.bookingId})`, (err as Error).message);
    return false;
  }
}

/**
 * Recordatorio 24h/2h. eventId = id de la notificación (lo aporta el drainer;
 * garantiza idempotencia por fila reclamada).
 */
export async function notifyBookingReminder(
  data: BookingNotifyData,
  ventana: '24h' | '2h',
  eventId: string,
  deps: NotifyDeps = defaultDeps(),
): Promise<boolean> {
  try {
    if (deps.webhookUrl) {
      const eventName = ventana === '24h' ? 'booking.reminder.24h' : 'booking.reminder.2h';
      const r = await deps.emit(eventName, toEventData(data), {
        businessId: data.businessId,
        eventId,
      });
      return emitDispatched(r);
    }
    const html = reminderTemplate(
      {
        customerName: data.customerName,
        serviceName: data.serviceName,
        startsAt: data.startsAt,
        employeeName: data.employeeName,
        businessName: data.businessName,
      },
      ventana,
    );
    const subject = ventana === '24h'
      ? `Recordatorio: tu cita de mañana — ${data.serviceName}`
      : `Recordatorio: tu cita es en 2 horas — ${data.serviceName}`;
    return await deliverDirectEmail(deps, data.businessId, { to: data.email, subject, html });
  } catch (err) {
    console.error(`[notify] booking.reminder.${ventana} soft-fail (${data.bookingId})`, (err as Error).message);
    return false;
  }
}

/**
 * No-show. eventId = `${bookingId}:no_show` (idempotente por transición).
 */
export async function notifyBookingNoShow(
  data: BookingNotifyData,
  deps: NotifyDeps = defaultDeps(),
): Promise<boolean> {
  try {
    if (deps.webhookUrl) {
      const r = await deps.emit('booking.no_show', toEventData(data), {
        businessId: data.businessId,
        eventId: `${data.bookingId}:no_show`,
      });
      return emitDispatched(r);
    }
    const html = noShowTemplate({
      customerName: data.customerName,
      serviceName: data.serviceName,
      startsAt: data.startsAt,
      businessName: data.businessName,
    });
    return await deliverDirectEmail(deps, data.businessId, {
      to: data.email,
      subject: `Te echamos de menos — ${data.serviceName || 'tu cita'}`,
      html,
    });
  } catch (err) {
    console.error(`[notify] booking.no_show soft-fail (${data.bookingId})`, (err as Error).message);
    return false;
  }
}
