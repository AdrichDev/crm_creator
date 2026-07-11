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
  | 'DATABASE_URL';

export type SecretProvider = 'openai' | 'gemini' | 'anthropic' | 'maps' | 'database';

export interface SecretSlot {
  name: SecretSlotName;
  label: string;
  scope: 'BACKEND_SECRET' | 'FRONTEND_PUBLIC';
  provider: SecretProvider;
  envVarName?: string;
  /** Agrupación para que el front pinte solo un subconjunto de tarjetas (ver TenantKeysPanel `groups`). */
  group: 'ai' | 'maps' | 'database';
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
