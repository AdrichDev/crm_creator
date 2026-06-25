// Envía los 3 emails REALES de citas (usando las plantillas y el transporte de producción)
// a una dirección de prueba. NO crea bookings ni toca la DB.
// Uso: npx tsx scripts/booking-emails-preview.ts
import 'dotenv/config';
import { sendEmail, confirmedTemplate, reminderTemplate, noShowTemplate } from '../src/lib/email.js';

const TO = process.env.SMTP_USER || 'achozas9@gmail.com';
const startsAt = new Date(Date.now() + 26 * 60 * 60 * 1000); // mañana-ish

const base = {
  customerName: 'Cliente Prueba',
  serviceName: 'Corte de pelo',
  startsAt,
  employeeName: 'Profesional Demo',
  businessName: 'Estudio Prueba',
};

const jobs: Array<[string, string, string]> = [
  ['CONFIRMACIÓN', '✅ Cita confirmada — Corte de pelo', confirmedTemplate(base)],
  ['RECORDATORIO 24h', '⏰ Recordatorio: tu cita es mañana', reminderTemplate(base, '24h')],
  ['RECORDATORIO 2h', '⏰ Recordatorio: tu cita en 2 horas', reminderTemplate(base, '2h')],
  ['NO-SHOW', 'Te echamos de menos — Corte de pelo', noShowTemplate(base)],
];

let ok = 0;
for (const [label, subject, html] of jobs) {
  const sent = await sendEmail({ to: TO, subject: `[PRUEBA] ${subject}`, html });
  console.log(`${sent ? '✅' : '❌'} ${label} → ${TO}`);
  if (sent) ok++;
}
console.log(`\n${ok}/${jobs.length} emails enviados. Revisa la bandeja de ${TO}.`);
process.exit(ok === jobs.length ? 0 : 1);
