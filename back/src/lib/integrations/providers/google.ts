// ---------------------------------------------------------------------------
// Configuración OAuth2 de Google para el CRM (crm-integraciones-comunicacion).
// Dos providers SEPARADOS (no unificado como AA): cada servicio pide SOLO su scope
// mínimo — gmail.send para Gmail, calendar.events para Calendar. Sin scopes extra
// (Decisión 5 del design: sin calendar.settings, sin scopes de más).
// gmail.send es scope "sensible" (verificación estándar de Google, sin CASA);
// gmail.modify sería "restringido" (CASA anual) y el código solo envía, nunca lee.
// ---------------------------------------------------------------------------

import { readTenantSecret, type TenantSecretDb } from '../../tenant-secrets/store.js';
import { readPlatformSecret, getPlatformSecret, type PlatformSettingDb } from '../../platform-secrets/store.js';

export type GoogleService = 'gmail' | 'calendar';

/**
 * El negocio tiene UNA de las dos credenciales OAuth propias (client_id o secret)
 * pero no la otra → configuración a medias. No se cae al env central (mezclaría el
 * proyecto Google del tenant con el secreto de la plataforma, o viceversa): se exige
 * que ambas vengan de la MISMA fuente. El nombre del slot que falta NO revela ningún
 * valor secreto.
 */
export class IncompleteTenantOAuthError extends Error {
  readonly businessId: string;
  readonly missing: 'GOOGLE_OAUTH_CLIENT_ID' | 'GOOGLE_OAUTH_CLIENT_SECRET';
  constructor(businessId: string, missing: 'GOOGLE_OAUTH_CLIENT_ID' | 'GOOGLE_OAUTH_CLIENT_SECRET') {
    super(`El negocio ${businessId} configuró parcialmente sus credenciales OAuth de Google: falta ${missing}`);
    this.name = 'IncompleteTenantOAuthError';
    this.businessId = businessId;
    this.missing = missing;
  }
}

export interface GoogleOAuthConfig {
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  tokenInfoUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Scope único requerido por el servicio. */
  scope: string;
  /** access_type=offline + prompt=consent → garantiza refresh_token en el primer consentimiento. */
  extraAuthParams: Record<string, string>;
  supportsRefresh: boolean;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

/** Scope mínimo por servicio (URL completa del scope de Google). */
const SCOPE_BY_SERVICE: Record<GoogleService, string> = {
  gmail: 'https://www.googleapis.com/auth/gmail.send',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
};

/** Nivel del que salió una credencial resuelta, en orden de prioridad. */
type CredSource = 'tenant' | 'platform' | 'env';

/** Prioridad de cada nivel (mayor = gana). null = credencial ausente en todos. */
function sourceRank(source: CredSource | null): number {
  return source === 'tenant' ? 3 : source === 'platform' ? 2 : source === 'env' ? 1 : 0;
}

/**
 * Resuelve UNA credencial a través de la cadena tenant → plataforma → env,
 * devolviendo el valor y el NIVEL del que salió. La plataforma solo se consulta si
 * se inyecta `platformDb` (los unit-tests que no la pasan omiten el nivel y caen al
 * env, regresión idéntica al histórico). `envName` puede diferir del nombre de slot
 * (el secreto vive como `GOOGLE_OAUTH_CLIENT_SECRET` pero el env legacy es
 * `GOOGLE_OAUTH_SECRET`).
 */
async function resolveCred(
  businessId: string,
  slotName: string,
  envName: string,
  secretDb?: TenantSecretDb,
  platformDb?: PlatformSettingDb,
): Promise<{ value: string; source: CredSource } | null> {
  const tenantVal = await readTenantSecret(businessId, slotName, secretDb);
  if (tenantVal) return { value: tenantVal, source: 'tenant' };

  if (platformDb) {
    const platformVal = await readPlatformSecret(slotName, platformDb);
    if (platformVal) return { value: platformVal, source: 'platform' };
  }

  const envVal = process.env[envName];
  if (envVal) return { value: envVal, source: 'env' };

  return null;
}

/**
 * Resuelve el par client_id/client_secret con el que se ejecuta el OAuth de un negocio.
 * Cadena de resolución (crm-central-oauth-admin-config): **tenant → plataforma → env**.
 *   - `businessId` con AMBOS secretos propios en TenantSecret → usa los del tenant.
 *   - si no, AMBOS en la config de plataforma (BD) → usa los de plataforma.
 *   - si no, `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_SECRET` del env (legacy, retro-compat).
 *   - par mezclado entre niveles (id de un nivel, secret de otro) → `IncompleteTenantOAuthError`.
 *   - Sin `businessId` (credencial de plataforma/admin, `null`) → plataforma → env.
 * Invariante par-o-nada POR NIVEL: nunca se mezcla el id de un nivel con el secret de otro.
 * El secreto vive solo en memoria del request: NUNCA se loguea ni se reenvía por HTTP.
 * `secretDb`/`platformDb` son inyectables (patrón DI del repo) para testear sin BD.
 */
async function resolveClientCreds(
  businessId?: string | null,
  secretDb?: TenantSecretDb,
  platformDb?: PlatformSettingDb,
): Promise<{ clientId: string; clientSecret: string }> {
  // Sin negocio (credencial admin/plataforma): no hay TenantSecret que consultar,
  // pero SÍ se consulta la config de plataforma (BD) antes del env legacy.
  if (!businessId) {
    const idPlat = platformDb ? await getPlatformSecret('GOOGLE_OAUTH_CLIENT_ID', { fallbackEnv: 'GOOGLE_OAUTH_CLIENT_ID' }, platformDb) : null;
    const secretPlat = platformDb ? await getPlatformSecret('GOOGLE_OAUTH_CLIENT_SECRET', { fallbackEnv: 'GOOGLE_OAUTH_SECRET' }, platformDb) : null;
    return {
      clientId: idPlat?.value ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: secretPlat?.value ?? process.env.GOOGLE_OAUTH_SECRET ?? '',
    };
  }

  const idRes = await resolveCred(businessId, 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_ID', secretDb, platformDb);
  const secretRes = await resolveCred(businessId, 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_SECRET', secretDb, platformDb);

  // Invariante par-o-nada por nivel: ambas creds del MISMO nivel. Si salen de niveles
  // distintos (o solo una está configurada), es un estado inconsistente y nunca se mezcla.
  // El slot "que falta" es el de menor prioridad (el que hay que completar en el nivel alto).
  const idRank = sourceRank(idRes?.source ?? null);
  const secretRank = sourceRank(secretRes?.source ?? null);
  if (idRank !== secretRank) {
    throw new IncompleteTenantOAuthError(businessId, idRank > secretRank ? 'GOOGLE_OAUTH_CLIENT_SECRET' : 'GOOGLE_OAUTH_CLIENT_ID');
  }

  return { clientId: idRes?.value ?? '', clientSecret: secretRes?.value ?? '' };
}

/**
 * Devuelve la config OAuth de Google para el servicio pedido, resolviendo client_id/
 * client_secret POR NEGOCIO (`businessId`) con fallback al env central del operador
 * (ver `resolveClientCreds`). No cachea: los tests pueden fijar el entorno o inyectar
 * `secretDb` sin recargar módulo.
 * GOOGLE_OAUTH_REDIRECT_URI (siempre central) admite el placeholder `{servicio}` (p.ej.
 * `https://host/api/integrations/{servicio}/callback`): el callback valida que el
 * servicio de la URL coincida con el del state, así que cada servicio necesita su
 * propia redirect URI (ambas registradas en la consola de Google). Sin placeholder,
 * el valor se usa tal cual y solo el servicio de esa ruta puede completar el flujo.
 */
export async function googleOAuthConfig(
  service: GoogleService,
  businessId?: string | null,
  secretDb?: TenantSecretDb,
  platformDb?: PlatformSettingDb,
): Promise<GoogleOAuthConfig> {
  const { clientId, clientSecret } = await resolveClientCreds(businessId, secretDb, platformDb);
  // La redirect URI es SIEMPRE central (no per-tenant): apunta al callback del back
  // de la plataforma. Se resuelve plataforma (BD) → env legacy — mismo objetivo de
  // "cero Render" que el par client_id/secret. Sin `platformDb` inyectado → env
  // directo (regresión idéntica al histórico).
  const redirectRaw = platformDb
    ? (await getPlatformSecret('GOOGLE_OAUTH_REDIRECT_URI', { fallbackEnv: 'GOOGLE_OAUTH_REDIRECT_URI' }, platformDb))?.value ?? ''
    : process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '';
  return {
    authUrl: AUTH_URL,
    tokenUrl: TOKEN_URL,
    revokeUrl: GOOGLE_REVOKE_URL,
    tokenInfoUrl: GOOGLE_TOKENINFO_URL,
    clientId,
    clientSecret,
    redirectUri: redirectRaw.replace('{servicio}', service),
    scope: SCOPE_BY_SERVICE[service],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    supportsRefresh: true,
  };
}

/** Scope requerido por servicio, expuesto para la validación del callback (422 si falta). */
export function requiredScope(service: GoogleService): string {
  return SCOPE_BY_SERVICE[service];
}
