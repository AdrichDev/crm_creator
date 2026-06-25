// Prueba de conexión/envío SMTP. NO imprime la contraseña.
// Uso: node scripts/smtp-test.mjs           -> solo verify() (login)
//      node scripts/smtp-test.mjs --send     -> verify + envía email de prueba a SMTP_USER
import 'dotenv/config';
import nodemailer from 'nodemailer';

const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, EMAIL_ENABLED,
} = process.env;

console.log('--- Config leída (sin password) ---');
console.log('SMTP_HOST   :', SMTP_HOST || '(vacío)');
console.log('SMTP_PORT   :', SMTP_PORT || '(vacío)');
console.log('SMTP_SECURE :', SMTP_SECURE || '(vacío)');
console.log('SMTP_USER   :', SMTP_USER || '(vacío)');
console.log('SMTP_FROM   :', SMTP_FROM || '(vacío)');
console.log('EMAIL_ENABLED:', EMAIL_ENABLED || '(vacío)');
console.log('SMTP_PASS   :', SMTP_PASS ? `(presente, ${SMTP_PASS.length} chars)` : '(VACÍA)');
console.log('-----------------------------------');

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('FALTAN claves SMTP (host/user/pass). Aborto.');
  process.exit(2);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 587),
  secure: SMTP_SECURE === 'true',
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

try {
  await transporter.verify();
  console.log('✅ VERIFY OK — login SMTP correcto.');
} catch (e) {
  console.error('❌ VERIFY FALLÓ:', e?.message || e);
  if (String(e?.message || e).includes('535')) {
    console.error('   → 535 = credenciales rechazadas. Probablemente pusiste la password normal, no una App Password de Gmail.');
  }
  process.exit(1);
}

if (process.argv.includes('--send')) {
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: SMTP_USER,
      subject: 'Prueba SMTP CRM — citas',
      text: 'Si lees esto, el transporte SMTP del back funciona. Puedes borrarlo.',
    });
    console.log('✅ ENVÍO OK — messageId:', info.messageId);
    console.log('   Revisa la bandeja de', SMTP_USER);
  } catch (e) {
    console.error('❌ ENVÍO FALLÓ:', e?.message || e);
    process.exit(1);
  }
}
