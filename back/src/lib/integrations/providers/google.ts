// ---------------------------------------------------------------------------
// Configuración OAuth2 de Google para el CRM (crm-integraciones-comunicacion).
// Dos providers SEPARADOS (no unificado como AA): cada servicio pide SOLO su scope
// mínimo — gmail.send para Gmail, calendar.events para Calendar. Sin scopes extra
// (Decisión 5 del design: sin calendar.settings, sin scopes de más).
// gmail.send es scope "sensible" (verificación estándar de Google, sin CASA);
// gmail.modify sería "restringido" (CASA anual) y el código solo envía, nunca lee.
// ---------------------------------------------------------------------------

import { getTenantSecret, type TenantSecretDb } from '../../tenant-secrets/store.js';

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

/**
 * Resuelve el par client_id/client_secret con el que se ejecuta el OAuth de un negocio
 * (crm-tenant-oauth-creds). Regla "trae tu propio proyecto":
 *   - `businessId` con AMBOS secretos propios (`GOOGLE_OAUTH_CLIENT_ID` +
 *     `GOOGLE_OAUTH_CLIENT_SECRET` en TenantSecret) → usa los del tenant.
 *   - `businessId` con NINGUNO → cae al env central del operador (comportamiento
 *     idéntico al histórico: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_SECRET`).
 *   - `businessId` con UNO solo (o tenant+central mezclados) → `IncompleteTenantOAuthError`.
 *   - Sin `businessId` (credencial de plataforma/admin, `null`) → siempre env central.
 * El secreto vive solo en memoria del request: NUNCA se loguea ni se reenvía por HTTP.
 * `secretDb` es inyectable (patrón DI del repo) para testear sin BD.
 */
async function resolveClientCreds(
  businessId?: string | null,
  secretDb?: TenantSecretDb,
): Promise<{ clientId: string; clientSecret: string }> {
  // Sin negocio (credencial admin/plataforma): no hay TenantSecret que consultar.
  if (!businessId) {
    return {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_OAUTH_SECRET ?? '',
    };
  }

  const idRes = await getTenantSecret(businessId, 'GOOGLE_OAUTH_CLIENT_ID', { fallbackEnv: 'GOOGLE_OAUTH_CLIENT_ID' }, secretDb);
  const secretRes = await getTenantSecret(businessId, 'GOOGLE_OAUTH_CLIENT_SECRET', { fallbackEnv: 'GOOGLE_OAUTH_SECRET' }, secretDb);

  const idFromTenant = idRes?.source === 'tenant';
  const secretFromTenant = secretRes?.source === 'tenant';

  // Invariante: ambas creds de la MISMA fuente. Una del tenant y la otra del central
  // (o solo una configurada) → estado inconsistente, nunca se mezcla.
  if (idFromTenant !== secretFromTenant) {
    throw new IncompleteTenantOAuthError(businessId, idFromTenant ? 'GOOGLE_OAUTH_CLIENT_SECRET' : 'GOOGLE_OAUTH_CLIENT_ID');
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
): Promise<GoogleOAuthConfig> {
  const { clientId, clientSecret } = await resolveClientCreds(businessId, secretDb);
  return {
    authUrl: AUTH_URL,
    tokenUrl: TOKEN_URL,
    revokeUrl: GOOGLE_REVOKE_URL,
    tokenInfoUrl: GOOGLE_TOKENINFO_URL,
    clientId,
    clientSecret,
    // La redirect URI es SIEMPRE la central: apunta al callback del back de la
    // plataforma, no al del tenant. Solo el client_id/secret son per-tenant.
    redirectUri: (process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '').replace('{servicio}', service),
    scope: SCOPE_BY_SERVICE[service],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    supportsRefresh: true,
  };
}

/** Scope requerido por servicio, expuesto para la validación del callback (422 si falta). */
export function requiredScope(service: GoogleService): string {
  return SCOPE_BY_SERVICE[service];
}
