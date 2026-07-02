import 'dotenv/config';

// ---------------------------------------------------------------------------
// Supabase Auth migration: removed jwtSecret/JWT_SECRET_DEFAULT/validateJwtSecret.
// Added SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.
// Fail-closed: all three must be non-empty strings (placeholder or real).
// ---------------------------------------------------------------------------

/** Lee una variable de entorno o devuelve el fallback. No "exige" nada (eso lo hace assertConfig). */
function envOr(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  port: Number(process.env.PORT ?? 4001),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: process.env.DATABASE_URL ?? '',
  // Cuántos saltos de proxy confiar (Express trust proxy). Default 1; 0 = no confiar.
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  // IA para extraer el diseño (paleta, tipografía, forma) de la landing importada.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',

  // URL pública del front, base de los enlaces de invitación/reset que viajan por email.
  frontUrl: process.env.FRONT_URL ?? 'http://localhost:3002',

  // Automatizaciones n8n (opcionales, fail-open). Si AUTOMATION_WEBHOOK_URL está vacío,
  // el emisor es no-op y las notificaciones de citas salen por SMTP directo (email.ts).
  // NO se exigen en assertConfig: el CRM arranca y opera sin n8n configurado.
  automationWebhookUrl: process.env.AUTOMATION_WEBHOOK_URL ?? '',
  automationWebhookSecret: process.env.AUTOMATION_WEBHOOK_SECRET ?? '',
  automationMaxAttempts: Number(process.env.AUTOMATION_MAX_ATTEMPTS ?? 3),
  automationTimeoutMs: Number(process.env.AUTOMATION_TIMEOUT_MS ?? 5000),

  // Supabase Auth — backend only. SERVICE_ROLE_KEY must NEVER reach the browser.
  // Placeholder values: replace with real Supabase project values before deploying.
  supabaseUrl: envOr('SUPABASE_URL', 'https://placeholder.supabase.co'),
  supabaseServiceRoleKey: envOr('SUPABASE_SERVICE_ROLE_KEY', 'placeholder-service-role-key'),
  // SUPABASE_JWT_SECRET eliminado: los tokens se verifican vía JWKS (ES256), no con
  // un secreto HS256 compartido. Ya no se lee ningún secreto para verificar.

  // SMTP (nodemailer) — transporte de email transaccional de citas.
  // Default seguro: smtpHost vacío → no-op (EMAIL_ENABLED=false en tests).
  smtpHost:    process.env.SMTP_HOST    ?? '',
  smtpPort:    Number(process.env.SMTP_PORT ?? 587),
  smtpSecure:  process.env.SMTP_SECURE === 'true',   // false = STARTTLS (puerto 587)
  smtpUser:    process.env.SMTP_USER    ?? '',
  smtpPass:    process.env.SMTP_PASS    ?? '',        // Gmail App Password (cuenta "SMTP CRM")
  smtpFrom:    process.env.SMTP_FROM    ?? '',        // e.g. "CRM <noreply@example.com>"
  emailEnabled: process.env.EMAIL_ENABLED !== 'false',// default true; poner false en tests/dev
};

/**
 * Fail-closed real: aborta el arranque si falta config crítica de Supabase (o quedan
 * placeholders). Llamar en server.ts antes de listen. Evita arrancar "verde" con auth/DB
 * rotos. No se ejecuta en tests (no importan server.ts).
 */
export function assertConfig(): void {
  const missing: string[] = [];
  if (!env.databaseUrl) missing.push('DATABASE_URL');
  if (!env.supabaseUrl || env.supabaseUrl.includes('placeholder')) missing.push('SUPABASE_URL');
  if (!env.supabaseServiceRoleKey || env.supabaseServiceRoleKey.includes('placeholder')) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    throw new Error(`[config] Supabase incompleto (fail-closed): falta/placeholder ${missing.join(', ')}. Configura back/.env antes de arrancar.`);
  }
}
