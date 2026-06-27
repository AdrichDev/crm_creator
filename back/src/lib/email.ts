import nodemailer from 'nodemailer';
import { env } from '../env.js';

// ---------------------------------------------------------------------------
// Transporte de email transaccional de citas.
// Principio rector: el CRM NUNCA depende del email para funcionar.
// sendEmail es soft-fail: nunca lanza; SMTP vacío/EMAIL_ENABLED=false → false.
// PII en logs: solo `to` y `subject`, nunca el cuerpo HTML.
// ---------------------------------------------------------------------------

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envía un email via SMTP (nodemailer).
 * Retorna true si el email se envió, false en cualquier otro caso.
 * NUNCA lanza.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!env.emailEnabled || !env.smtpHost) {
    console.log('[email] deshabilitado o sin SMTP configurado — omitido');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });

    await transporter.sendMail({
      from: env.smtpFrom,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    console.log(`[email] enviado a=${payload.to} subject="${payload.subject}"`);
    return true;
  } catch (err) {
    console.error(`[email] error al enviar a=${payload.to} subject="${payload.subject}"`, (err as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Plantillas inline en español (HTML mínimo, sin imágenes externas ni tracking).
// Evolución: motor de plantillas (Handlebars/MJML) para branding completo.
// ---------------------------------------------------------------------------

/** Escapa caracteres HTML para evitar inyección/XSS en datos controlados por el tenant. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ConfirmedData {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  employeeName?: string;
  businessName: string;
}

export function confirmedTemplate(data: ConfirmedData): string {
  const fecha = data.startsAt.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hora  = data.startsAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const profesional = data.employeeName ? `<p><strong>Profesional:</strong> ${esc(data.employeeName)}</p>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Cita confirmada</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
  <h2 style="color:#1d4ed8">Tu cita está confirmada</h2>
  <p>Hola, <strong>${esc(data.customerName)}</strong>. Tu reserva ha sido registrada con éxito.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p><strong>Servicio:</strong> ${esc(data.serviceName)}</p>
  <p><strong>Fecha:</strong> ${fecha}</p>
  <p><strong>Hora:</strong> ${hora}</p>
  ${profesional}
  <p><strong>Negocio:</strong> ${esc(data.businessName)}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p style="color:#6b7280;font-size:14px">Si necesitas cancelar o modificar tu cita, contacta con nosotros.</p>
</body>
</html>`;
}

interface ReminderData {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  employeeName?: string;
  businessName: string;
}

export function reminderTemplate(data: ReminderData, window: '24h' | '2h'): string {
  const fecha = data.startsAt.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hora  = data.startsAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const profesional = data.employeeName ? `<p><strong>Profesional:</strong> ${esc(data.employeeName)}</p>` : '';
  const cuandoLabel = window === '24h' ? 'mañana' : 'en 2 horas';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Recordatorio de cita</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
  <h2 style="color:#1d4ed8">Recordatorio: tienes una cita ${cuandoLabel}</h2>
  <p>Hola, <strong>${esc(data.customerName)}</strong>. Te recordamos tu próxima cita.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p><strong>Servicio:</strong> ${esc(data.serviceName)}</p>
  <p><strong>Fecha:</strong> ${fecha}</p>
  <p><strong>Hora:</strong> ${hora}</p>
  ${profesional}
  <p><strong>Negocio:</strong> ${esc(data.businessName)}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p style="color:#6b7280;font-size:14px">Si necesitas cancelar o modificar tu cita, contacta con nosotros antes de la hora indicada.</p>
</body>
</html>`;
}

interface NoShowData {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  businessName: string;
}

export function noShowTemplate(data: NoShowData): string {
  const fecha = data.startsAt.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hora  = data.startsAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Te echamos de menos</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
  <h2 style="color:#1d4ed8">¡Te echamos de menos!</h2>
  <p>Hola, <strong>${esc(data.customerName)}</strong>. Notamos que no pudiste asistir a tu cita.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p><strong>Servicio:</strong> ${esc(data.serviceName)}</p>
  <p><strong>Fecha:</strong> ${fecha}</p>
  <p><strong>Hora:</strong> ${hora}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p>Cuando quieras, puedes volver a reservar tu cita con <strong>${esc(data.businessName)}</strong>. Estaremos encantados de atenderte.</p>
  <p style="color:#6b7280;font-size:14px">Si tuviste algún inconveniente, no dudes en contactarnos.</p>
</body>
</html>`;
}
