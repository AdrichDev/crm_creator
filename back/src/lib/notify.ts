import { env } from '../env.js';
import { emit as defaultEmit } from './automation/index.js';
import type { BookingEventData } from './automation/index.js';
import {
  sendEmail as defaultSendEmail,
  confirmedTemplate,
  reminderTemplate,
  noShowTemplate,
} from './email.js';

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
}

function defaultDeps(): NotifyDeps {
  return {
    webhookUrl: env.automationWebhookUrl,
    emit: defaultEmit,
    sendEmail: defaultSendEmail,
  };
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
  return deps.sendEmail({
    to: data.email,
    subject: `Cita confirmada — ${data.serviceName || 'tu servicio'}`,
    html,
  });
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
  return deps.sendEmail({ to: data.email, subject, html });
}

/**
 * No-show. eventId = `${bookingId}:no_show` (idempotente por transición).
 */
export async function notifyBookingNoShow(
  data: BookingNotifyData,
  deps: NotifyDeps = defaultDeps(),
): Promise<boolean> {
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
  return deps.sendEmail({
    to: data.email,
    subject: `Te echamos de menos — ${data.serviceName || 'tu cita'}`,
    html,
  });
}
