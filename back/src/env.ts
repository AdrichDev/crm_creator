import 'dotenv/config';

// ---------------------------------------------------------------------------
// H3: en producción, un JWT_SECRET vacío o con el valor por defecto de
// desarrollo es un fallo de seguridad crítico. Fallar en arranque evita que
// el servidor sirva tráfico con credenciales inseguras.
// ---------------------------------------------------------------------------
export const JWT_SECRET_DEFAULT = 'dev-secret-change-me';

/**
 * Valida la robustez del JWT_SECRET según el entorno.
 * Exportada para poder testear la lógica de validación de forma aislada.
 * Lanza si `nodeEnv === 'production'` y el secreto es inseguro.
 * Emite console.warn en otros entornos.
 */
export function validateJwtSecret(secret: string, nodeEnv: string | undefined): void {
  const isWeak = !secret || secret === JWT_SECRET_DEFAULT;
  if (nodeEnv === 'production') {
    if (isWeak) {
      throw new Error('[env] JWT_SECRET no puede ser el valor por defecto ni estar vacío en producción.');
    }
  } else if (isWeak) {
    console.warn('[env] ADVERTENCIA: JWT_SECRET usa el valor por defecto de desarrollo. Cámbialo antes de ir a producción.');
  }
}

const jwtSecret = process.env.JWT_SECRET ?? JWT_SECRET_DEFAULT;
validateJwtSecret(jwtSecret, process.env.NODE_ENV);

export const env = {
  port: Number(process.env.PORT ?? 4001),
  jwtSecret,
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: process.env.DATABASE_URL ?? '',
  // Cuántos saltos de proxy confiar (Express trust proxy). Default 1; 0 = no confiar.
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  // IA para extraer el diseño (paleta, tipografía, forma) de la landing importada.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',

  // URL pública del front, base de los enlaces de invitación/reset que viajan por email.
  frontUrl: process.env.FRONT_URL ?? 'http://localhost:3002',

  // Automatizaciones n8n. Si AUTOMATION_WEBHOOK_URL está vacío, el emisor es no-op
  // (no envía nada) y el CRM sigue funcionando: el envío de email es best-effort.
  automationWebhookUrl: process.env.AUTOMATION_WEBHOOK_URL ?? '',
  automationWebhookSecret: process.env.AUTOMATION_WEBHOOK_SECRET ?? '',
  automationMaxAttempts: Number(process.env.AUTOMATION_MAX_ATTEMPTS ?? 3),
  automationTimeoutMs: Number(process.env.AUTOMATION_TIMEOUT_MS ?? 5000),
};
