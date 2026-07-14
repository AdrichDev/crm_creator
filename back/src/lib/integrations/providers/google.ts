// ---------------------------------------------------------------------------
// Configuración OAuth2 de Google para el CRM (crm-integraciones-comunicacion).
// Dos providers SEPARADOS (no unificado como AA): cada servicio pide SOLO su scope
// mínimo — gmail.send para Gmail, calendar.events para Calendar. Sin scopes extra
// (Decisión 5 del design: sin calendar.settings, sin scopes de más).
// gmail.send es scope "sensible" (verificación estándar de Google, sin CASA);
// gmail.modify sería "restringido" (CASA anual) y el código solo envía, nunca lee.
// ---------------------------------------------------------------------------

export type GoogleService = 'gmail' | 'calendar';

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
 * Devuelve la config OAuth de Google para el servicio pedido. Lee client id/secret/redirect
 * de env en cada llamada (no cachea): así los tests pueden fijar el entorno sin recargar módulo.
 */
export function googleOAuthConfig(service: GoogleService): GoogleOAuthConfig {
  return {
    authUrl: AUTH_URL,
    tokenUrl: TOKEN_URL,
    revokeUrl: GOOGLE_REVOKE_URL,
    tokenInfoUrl: GOOGLE_TOKENINFO_URL,
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_OAUTH_SECRET ?? '',
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
    scope: SCOPE_BY_SERVICE[service],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    supportsRefresh: true,
  };
}

/** Scope requerido por servicio, expuesto para la validación del callback (422 si falta). */
export function requiredScope(service: GoogleService): string {
  return SCOPE_BY_SERVICE[service];
}
