// crm-onboarding-tenant-keys: catálogo fijo de los 5 slots de secreto por-tenant que el
// panel humano (onboarding + Configuración vía crm-tenant-keys-self-service) puede
// gestionar. ÚNICA fuente de verdad: los endpoints `/tenant-keys/:businessId/secrets`
// (tenant-keys.ts) NUNCA aceptan `scope`/`envVarName`/`provider` del cliente — siempre
// los resuelven aquí a partir de `name`. `crm-tenant-keys-self-service` importa este
// archivo tal cual, no declara una copia.

export type SecretSlotName =
  | 'OPENAI_API_KEY'
  | 'GEMINI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GOOGLE_MAPS_API_KEY'
  | 'DATABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  | 'GOOGLE_OAUTH_CLIENT_ID'
  | 'GOOGLE_OAUTH_CLIENT_SECRET'
  | 'MAIL_ADDRESS'
  | 'MAIL_APP_PASSWORD'
  | 'IMAP_HOST'
  | 'IMAP_PORT'
  | 'SMTP_HOST'
  | 'SMTP_PORT';

export type SecretProvider =
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'maps'
  | 'database'
  | 'supabase_url'
  | 'supabase_anon'
  | 'google'
  | 'mail';

export interface SecretSlot {
  name: SecretSlotName;
  label: string;
  scope: 'BACKEND_SECRET' | 'FRONTEND_PUBLIC';
  provider: SecretProvider;
  envVarName?: string;
  /** Agrupación para que el front pinte solo un subconjunto de tarjetas (ver TenantKeysPanel `groups`). */
  group: 'ai' | 'maps' | 'database' | 'google' | 'mail';
}

export const TENANT_SECRET_CATALOG: SecretSlot[] = [
  { name: 'OPENAI_API_KEY', label: 'OpenAI', scope: 'BACKEND_SECRET', provider: 'openai', group: 'ai' },
  { name: 'GEMINI_API_KEY', label: 'Gemini', scope: 'BACKEND_SECRET', provider: 'gemini', group: 'ai' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic', scope: 'BACKEND_SECRET', provider: 'anthropic', group: 'ai' },
  {
    name: 'GOOGLE_MAPS_API_KEY',
    label: 'Google Maps',
    scope: 'FRONTEND_PUBLIC',
    provider: 'maps',
    envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    group: 'maps',
  },
  { name: 'DATABASE_URL', label: 'URL (BD)', scope: 'BACKEND_SECRET', provider: 'database', group: 'database' },
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    label: 'Supabase URL',
    scope: 'FRONTEND_PUBLIC',
    provider: 'supabase_url',
    envVarName: 'NEXT_PUBLIC_SUPABASE_URL',
    group: 'database',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    label: 'Supabase anon key',
    scope: 'FRONTEND_PUBLIC',
    provider: 'supabase_anon',
    envVarName: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    group: 'database',
  },
  // crm-tenant-oauth-creds: client_id/secret del proyecto Google Cloud del propio
  // tenant (patrón "trae tu propio proyecto"). BACKEND_SECRET y SIN `envVarName`: el
  // back los resuelve en tiempo de OAuth (providers/google.ts), NUNCA se hornean al
  // export del front. Vacíos → se usa la app central del operador (fallback env).
  { name: 'GOOGLE_OAUTH_CLIENT_ID', label: 'Google OAuth Client ID', scope: 'BACKEND_SECRET', provider: 'google', group: 'google' },
  { name: 'GOOGLE_OAUTH_CLIENT_SECRET', label: 'Google OAuth Client Secret', scope: 'BACKEND_SECRET', provider: 'google', group: 'google' },
  // crm-tenant-oauth-creds-and-mail-connector (Fase 2): conector IMAP/SMTP genérico para
  // tenants con buzón fuera de Google/Microsoft (Hostinger, Zoho, cPanel, IONOS, GoDaddy…).
  // BACKEND_SECRET y SIN `envVarName`: el back los resuelve en tiempo de envío/lectura
  // (lib/mail-connector.ts), NUNCA se hornean al export del front. Los puertos tienen
  // default sano si se dejan vacíos (IMAP 993 TLS, SMTP 465) — ver DEFAULT_IMAP_PORT /
  // DEFAULT_SMTP_PORT en mail-connector.ts.
  { name: 'MAIL_ADDRESS', label: 'Dirección de correo', scope: 'BACKEND_SECRET', provider: 'mail', group: 'mail' },
  { name: 'MAIL_APP_PASSWORD', label: 'Contraseña de aplicación', scope: 'BACKEND_SECRET', provider: 'mail', group: 'mail' },
  { name: 'IMAP_HOST', label: 'Servidor IMAP', scope: 'BACKEND_SECRET', provider: 'mail', group: 'mail' },
  { name: 'IMAP_PORT', label: 'Puerto IMAP', scope: 'BACKEND_SECRET', provider: 'mail', group: 'mail' },
  { name: 'SMTP_HOST', label: 'Servidor SMTP', scope: 'BACKEND_SECRET', provider: 'mail', group: 'mail' },
  { name: 'SMTP_PORT', label: 'Puerto SMTP', scope: 'BACKEND_SECRET', provider: 'mail', group: 'mail' },
];

const CATALOG_BY_NAME = new Map(TENANT_SECRET_CATALOG.map((slot) => [slot.name, slot]));

/** Busca un slot del catálogo por nombre. Devuelve `undefined` (no lanza) si no existe. */
export function findSecretSlot(name: string): SecretSlot | undefined {
  return CATALOG_BY_NAME.get(name as SecretSlotName);
}

// crm-tenant-keys-freeform: formato de nombre para keys libres (fuera del catálogo de 5
// presets). Mayúsculas/dígitos/guion bajo, empieza por letra — mismo espíritu que el
// `ENV_VAR_NAME_PATTERN` de service-operator-tenant-keys.ts pero sin exigir prefijo
// NEXT_PUBLIC_ (aquí cubre tanto scope público como secreto).
export const ENV_KEY_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Scope inferido por convención Next.js: prefijo NEXT_PUBLIC_ = va al bundle del front. */
export function inferScope(name: string): 'FRONTEND_PUBLIC' | 'BACKEND_SECRET' {
  return name.startsWith('NEXT_PUBLIC_') ? 'FRONTEND_PUBLIC' : 'BACKEND_SECRET';
}
