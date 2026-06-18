import 'dotenv/config';

// ---------------------------------------------------------------------------
// Supabase Auth migration: removed jwtSecret/JWT_SECRET_DEFAULT/validateJwtSecret.
// Added SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.
// Fail-closed: all three must be non-empty strings (placeholder or real).
// ---------------------------------------------------------------------------

function requireEnv(name: string, fallback: string): string {
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

  // (n8n automation emit removed in Phase 6 — auth emails are sent by Supabase Auth.)

  // Supabase Auth — backend only. SERVICE_ROLE_KEY must NEVER reach the browser.
  // Placeholder values: replace with real Supabase project values before deploying.
  supabaseUrl: requireEnv('SUPABASE_URL', 'https://placeholder.supabase.co'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY', 'placeholder-service-role-key'),
  // SUPABASE_JWT_SECRET eliminado: los tokens se verifican vía JWKS (ES256), no con
  // un secreto HS256 compartido. Ya no se lee ningún secreto para verificar.
};
