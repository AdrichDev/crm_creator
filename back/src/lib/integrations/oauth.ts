// ---------------------------------------------------------------------------
// Orquestador OAuth del CRM (crm-integraciones-comunicacion, WU1).
// Port adaptado del patrón probado en agents-agency: cifrado enc:v1:, refresh
// perezoso con lock anti-carrera, revoke. Diferencias con AA:
//   - multi-tenant: scoping por businessId (null = credencial de plataforma/admin)
//   - revoke = SOFT-delete (estado='revoked' + revokedAt), no hard-delete
//   - un provider Google POR servicio, cada uno con su scope mínimo
//   - validación de scope en el callback (tokeninfo) → ScopeInsufficientError (422)
// Dependencias (repo Prisma + fetch) inyectables → unit-test sin DB ni red, mismo
// patrón que notify.ts / calendarToken.ts. La capa HTTP (routes) y la integración en
// notify.ts son WU1 posterior (PR chained).
// ---------------------------------------------------------------------------

import { prisma } from '../../prisma.js';
import { encrypt, decrypt } from '../crypto.js';
import {
  googleOAuthConfig,
  requiredScope,
  type GoogleService,
} from './providers/google.js';
import { randomBytes } from 'node:crypto';

export type Servicio = 'gmail' | 'whatsapp' | 'calendar';
export type EstadoCredencial = 'connected' | 'reauth_required' | 'revoked';

// ── Errores tipados ────────────────────────────────────────────────────────

/** La credencial no existe (nunca conectada) para ese businessId+servicio. */
export class IntegrationMissingError extends Error {
  constructor(businessId: string | null, servicio: Servicio) {
    super(`El negocio ${businessId ?? '(admin)'} no tiene conectado ${servicio}`);
    this.name = 'IntegrationMissingError';
  }
}

/** El token fue revocado/caducado sin refresh válido → hace falta reconectar. */
export class ReauthRequiredError extends Error {
  readonly servicio: Servicio;
  readonly businessId: string | null;
  constructor(businessId: string | null, servicio: Servicio) {
    super(`La integración ${servicio} requiere reconexión (token revocado o caducado)`);
    this.name = 'ReauthRequiredError';
    this.servicio = servicio;
    this.businessId = businessId;
  }
}

/** El consentimiento no otorgó el scope mínimo → no se persiste la credencial (422). */
export class ScopeInsufficientError extends Error {
  readonly servicio: Servicio;
  readonly required: string;
  readonly granted: string[];
  constructor(servicio: Servicio, required: string, granted: string[]) {
    super(`Scope insuficiente para ${servicio}: falta ${required}`);
    this.name = 'ScopeInsufficientError';
    this.servicio = servicio;
    this.required = required;
    this.granted = granted;
  }
}

// ── Cifrado enc:v1: ────────────────────────────────────────────────────────

const ENC_PREFIX = 'enc:v1:';

/** Cifra un token y lo envuelve con el prefijo enc:v1:. */
export function encryptToken(plain: string): string {
  const payload = encrypt(plain);
  return ENC_PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64');
}

/** Descifra un token enc:v1:. Sin prefijo → passthrough legacy (no había cifrado). */
export function decryptToken(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const json = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64').toString('utf8');
  return decrypt(JSON.parse(json));
}

/** true si el valor ya está cifrado (tiene el prefijo enc:v1:). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

// ── Dependencias inyectables ─────────────────────────────────────────────────

/** Fila de credencial que necesita la lógica OAuth (subconjunto del modelo Prisma). */
export interface CredentialRow {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

/** Campos que la lógica puede actualizar sobre una credencial. */
export interface CredentialUpdate {
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopesOauth?: string[];
  estado?: EstadoCredencial;
  revokedAt?: Date | null;
}

/** Datos para crear una credencial nueva. */
export interface CredentialCreate {
  businessId: string | null;
  servicio: Servicio;
  scope: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopesOauth: string[];
  estado: EstadoCredencial;
}

/** Puerto Prisma + fetch. Inyectable para testear sin DB ni red. */
export interface OAuthDeps {
  findCredential(businessId: string | null, servicio: Servicio): Promise<CredentialRow | null>;
  updateCredential(id: string, data: CredentialUpdate): Promise<void>;
  createCredential(data: CredentialCreate): Promise<void>;
  fetch: typeof fetch;
}

// findUnique sobre el compuesto [businessId, servicio] no maneja businessId null
// (Postgres/Prisma tratan NULL como distinto). findFirst SÍ → soporta credencial admin.
// Exportada (no solo default param interno): WU2 (integrations/whatsapp.ts) la reusa
// para no duplicar el wiring a Prisma.
export function defaultDeps(): OAuthDeps {
  return {
    async findCredential(businessId, servicio) {
      return prisma.oAuthCredential.findFirst({
        where: { businessId, servicio },
        select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
      });
    },
    async updateCredential(id, data) {
      await prisma.oAuthCredential.update({ where: { id }, data });
    },
    async createCredential(data) {
      await prisma.oAuthCredential.create({ data });
    },
    fetch: (...args) => fetch(...args),
  };
}

// ── Providers ──────────────────────────────────────────────────────────────

/** Servicios respaldados por Google OAuth (WhatsApp no usa este flujo). */
function asGoogleService(servicio: Servicio): GoogleService {
  if (servicio === 'gmail' || servicio === 'calendar') return servicio;
  throw new Error(`El servicio ${servicio} no usa OAuth de Google`);
}

// ── Lock anti-carrera para refresh ───────────────────────────────────────────

const refreshLocks = new Map<string, Promise<string>>();

/** Solo para tests: limpia locks de refresh en vuelo. */
export function resetRefreshLocks(): void { refreshLocks.clear(); }

// ── getValidToken (capa única) ───────────────────────────────────────────────

/**
 * Devuelve un access token válido en texto plano. Descifra, refresca si expiró
 * (margen 60s, con lock anti-carrera), maneja invalid_grant → ReauthRequiredError.
 * TODOS los consumidores (notify, poller de Calendar) pasan por aquí.
 */
export async function getValidToken(
  businessId: string | null,
  servicio: Servicio,
  deps: OAuthDeps = defaultDeps(),
): Promise<string> {
  const gservice = asGoogleService(servicio);
  const credential = await deps.findCredential(businessId, servicio);
  if (!credential) throw new IntegrationMissingError(businessId, servicio);

  const plainAccess = decryptToken(credential.accessToken);

  const isExpired =
    credential.expiresAt !== null &&
    credential.expiresAt.getTime() < Date.now() + 60_000;

  const cfg = googleOAuthConfig(gservice);
  const shouldRefresh = isExpired && cfg.supportsRefresh && !!credential.refreshToken;
  if (!shouldRefresh) return plainAccess;

  // Lock anti-carrera: una segunda llamada concurrente reutiliza la promesa en vuelo.
  const lockKey = `${businessId ?? 'admin'}:${servicio}`;
  const existing = refreshLocks.get(lockKey);
  if (existing) return existing;

  const promise = doRefresh(businessId, servicio, credential, deps)
    .finally(() => refreshLocks.delete(lockKey));
  refreshLocks.set(lockKey, promise);
  return promise;
}

async function doRefresh(
  businessId: string | null,
  servicio: Servicio,
  credential: CredentialRow,
  deps: OAuthDeps,
): Promise<string> {
  const cfg = googleOAuthConfig(asGoogleService(servicio));
  const plainRefresh = decryptToken(credential.refreshToken!);

  try {
    const res = await deps.fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: plainRefresh,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;

    // invalid_grant / 401 / 400 → credencial muerta, marcar reauth_required.
    if (!res.ok || data.error) {
      const err = data.error as string | undefined;
      if (err === 'invalid_grant' || err === 'invalid_token' || res.status === 401 || res.status === 400) {
        await deps.updateCredential(credential.id, { estado: 'reauth_required' });
        throw new ReauthRequiredError(businessId, servicio);
      }
      // Otro error (5xx) = fallo transitorio: devolver token viejo, NO marcar reauth.
      console.error(`[oauth] refresh ${servicio} falló con estado ${res.status}`);
      return decryptToken(credential.accessToken);
    }

    const newAccess = data.access_token as string;
    await deps.updateCredential(credential.id, {
      accessToken: encryptToken(newAccess),
      ...(typeof data.refresh_token === 'string' ? { refreshToken: encryptToken(data.refresh_token) } : {}),
      expiresAt: typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : null,
      estado: 'connected',
    });
    return newAccess;
  } catch (e) {
    if (e instanceof ReauthRequiredError) throw e;
    // Error de red/transitorio: devolver token viejo sin marcar reauth.
    console.error(`[oauth] refresh ${servicio} error transitorio:`, (e as Error).message);
    return decryptToken(credential.accessToken);
  }
}

// ── URL de autorización ──────────────────────────────────────────────────────

const STATE_TTL_MS = 10 * 60 * 1000;

interface StateEntry { businessId: string | null; servicio: Servicio; exp: number }
const stateStore = new Map<string, StateEntry>();

function purgeExpiredStates(now: number): void {
  for (const [nonce, entry] of stateStore) if (now > entry.exp) stateStore.delete(nonce);
}

/** Crea y registra un nonce de un solo uso (anti-CSRF) para el flujo OAuth. */
export function createOAuthState(businessId: string | null, servicio: Servicio, now = Date.now()): string {
  purgeExpiredStates(now);
  const nonce = randomBytes(16).toString('hex');
  stateStore.set(nonce, { businessId, servicio, exp: now + STATE_TTL_MS });
  return nonce;
}

/** Consume el nonce (get+delete, un solo uso). null si no existe o expiró. */
export function takeOAuthState(nonce: string, now = Date.now()): StateEntry | null {
  const entry = stateStore.get(nonce);
  stateStore.delete(nonce);
  if (!entry || now > entry.exp) return null;
  return entry;
}

/** Genera la URL OAuth de Google con nonce anti-CSRF y el scope mínimo del servicio. */
export function authorizationUrl(servicio: Servicio, businessId: string | null): string {
  const cfg = googleOAuthConfig(asGoogleService(servicio));
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error('Faltan credenciales OAuth de Google en back/.env (GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)');
  }
  const nonce = createOAuthState(businessId, servicio);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scope,
    state: nonce,
    ...cfg.extraAuthParams,
  });
  return `${cfg.authUrl}?${params}`;
}

// ── Callback: intercambio de code + validación de scope + persistencia ────────

/**
 * Intercambia el code por tokens, valida que el scope concedido cubre el requerido
 * (tokeninfo) y persiste la credencial cifrada. Lanza ScopeInsufficientError (→422)
 * si falta scope; en ese caso NO persiste nada.
 */
export async function handleCallback(
  servicio: Servicio,
  code: string,
  businessId: string | null,
  deps: OAuthDeps = defaultDeps(),
): Promise<void> {
  const gservice = asGoogleService(servicio);
  const cfg = googleOAuthConfig(gservice);

  // Fail-fast si la clave de cifrado no está disponible (no persistir en claro).
  encryptToken('key-check');

  const res = await deps.fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.error) {
    throw new Error(
      `OAuth ${servicio}: ${(data.error_description as string) ?? (data.error as string) ?? res.status}`,
    );
  }

  const accessToken = data.access_token as string | undefined;
  if (!accessToken) throw new Error(`OAuth ${servicio}: no se recibió access_token`);

  // Validar scope concedido (Decisión 5): fallar rápido en connect, no en primer uso.
  const granted = await fetchGrantedScopes(deps, cfg.tokenInfoUrl, accessToken, data.scope);
  const need = requiredScope(gservice);
  if (!granted.includes(need)) {
    throw new ScopeInsufficientError(servicio, need, granted);
  }

  const encryptedAccess = encryptToken(accessToken);
  const encryptedRefresh = typeof data.refresh_token === 'string' ? encryptToken(data.refresh_token) : null;
  const expiresAt = typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : null;

  // find-then-write null-safe (upsert no maneja businessId null en el compuesto unique).
  const existing = await deps.findCredential(businessId, servicio);
  if (existing) {
    await deps.updateCredential(existing.id, {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt,
      scopesOauth: granted,
      estado: 'connected',
      revokedAt: null,
    });
  } else {
    await deps.createCredential({
      businessId,
      servicio,
      scope: businessId === null ? 'admin' : 'tenant',
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt,
      scopesOauth: granted,
      estado: 'connected',
    });
  }
}

/** Lee los scopes concedidos vía tokeninfo; cae al campo `scope` de la respuesta si falla. */
async function fetchGrantedScopes(
  deps: OAuthDeps,
  tokenInfoUrl: string,
  accessToken: string,
  scopeFromToken: unknown,
): Promise<string[]> {
  try {
    const res = await deps.fetch(`${tokenInfoUrl}?access_token=${encodeURIComponent(accessToken)}`);
    if (res.ok) {
      const info = (await res.json()) as { scope?: string };
      if (typeof info.scope === 'string' && info.scope.length > 0) return info.scope.split(' ');
    }
  } catch {
    // tokeninfo no disponible → usar el scope declarado en la respuesta del token.
  }
  return typeof scopeFromToken === 'string' ? scopeFromToken.split(' ') : [];
}

// ── Disconnect / revoke (SOFT-delete) ─────────────────────────────────────────

/**
 * Revoca la credencial. Best-effort revoke remoto SOLO para servicios respaldados por
 * Google (gmail/calendar) — no bloquea si falla. WhatsApp (WU2) no tiene secreto real
 * que revocar en un proveedor (Decisión 5 del design: marcador sin OAuth), así que
 * salta directo al soft-delete. Luego SOFT-delete: estado='revoked' + revokedAt. La
 * fila NO se borra (auditoría). No-op silencioso si no existe la credencial.
 *
 * Devuelve la fila revocada (o null si no existía) para que el caller pueda usar su
 * `id` sin una segunda consulta (p.ej. integrations/whatsapp.ts para emitir el evento
 * de notificación con el credentialId correcto).
 */
export async function disconnectIntegration(
  businessId: string | null,
  servicio: Servicio,
  deps: OAuthDeps = defaultDeps(),
): Promise<CredentialRow | null> {
  const credential = await deps.findCredential(businessId, servicio);
  if (!credential) return null;

  if (servicio === 'gmail' || servicio === 'calendar') {
    try {
      const cfg = googleOAuthConfig(servicio);
      const token = decryptToken(credential.accessToken);
      await deps.fetch(`${cfg.revokeUrl}?token=${encodeURIComponent(token)}`, { method: 'POST' });
    } catch {
      // No bloquear el soft-delete si el revoke remoto falla.
    }
  }

  await deps.updateCredential(credential.id, { estado: 'revoked', revokedAt: new Date() });
  return credential;
}
