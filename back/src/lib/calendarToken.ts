import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Servicio de token del feed ICS (crm-citas-google-calendar, WU1.2).
// Mismo principio que los tokens de auth: el valor en claro NUNCA se persiste,
// solo su hash SHA-256; se devuelve en claro una única vez (al generar/regenerar).
// 1 fila por usuario (unique userId en la tabla `token_calendario`); regenerar
// sobrescribe el hash (invalida el anterior al instante); revocar marca revokedAt.
// ---------------------------------------------------------------------------

/** 32 bytes de entropía (256 bits) — muy por encima del mínimo de 32 bytes pedido. */
const TOKEN_BYTES = 32;

/** Genera un token opaco en claro, codificado hex (64 caracteres, seguro para URL). */
export function generateRawToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/** Hashea el token en claro (SHA-256, hex) para persistirlo/compararlo. */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export interface CalendarTokenRow {
  tokenHash: string;
  revokedAt: Date | null;
}

/** Puerto de persistencia — inyectable para tests sin DB real. */
export interface CalendarTokenRepo {
  findByUserId(userId: string): Promise<CalendarTokenRow | null>;
  /** Crea la fila si no existe, o sobrescribe tokenHash/revokedAt=null si ya existe (regenerar). */
  upsert(userId: string, tokenHash: string, now: Date): Promise<void>;
  /** Marca revokedAt=now sobre la fila existente del usuario. No-op si no hay fila. */
  revoke(userId: string, now: Date): Promise<void>;
  /** Resuelve el userId dueño de un hash NO revocado. null si no existe o está revocado. */
  findActiveOwnerByHash(tokenHash: string): Promise<{ userId: string } | null>;
}

export interface GenerateResult {
  /** Token en claro — mostrar UNA sola vez al caller (nunca se puede recuperar después). */
  token: string;
  /** true si ya existía un token previo (activo o revocado) que quedó invalidado. */
  regenerated: boolean;
}

/**
 * Genera el token ICS del usuario. Si ya tenía uno (activo o revocado), lo
 * sobrescribe: el hash anterior deja de coincidir con nada → invalidación instantánea.
 */
export async function generateOrRegenerateToken(
  repo: CalendarTokenRepo,
  userId: string,
  now: Date = new Date(),
): Promise<GenerateResult> {
  const existing = await repo.findByUserId(userId);
  const raw = generateRawToken();
  await repo.upsert(userId, hashToken(raw), now);
  return { token: raw, regenerated: existing !== null };
}

/** Revoca el token del usuario (si existe). Idempotente. */
export async function revokeCalendarToken(
  repo: CalendarTokenRepo,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await repo.revoke(userId, now);
}

/**
 * Resuelve el dueño de un token en claro recibido en la URL del feed.
 * Devuelve null tanto si el token nunca existió como si fue revocado — respuesta
 * indistinguible en el caller (404 opaco), evita filtrar si el token "existió".
 */
export async function resolveTokenOwner(
  repo: CalendarTokenRepo,
  rawToken: string,
): Promise<string | null> {
  if (!rawToken) return null;
  const found = await repo.findActiveOwnerByHash(hashToken(rawToken));
  return found ? found.userId : null;
}

/** Estado del token para mostrar en Mi Cuenta (sin exponer el valor en claro). */
export interface CalendarTokenStatus {
  hasToken: boolean;
}

export async function getCalendarTokenStatus(
  repo: CalendarTokenRepo,
  userId: string,
): Promise<CalendarTokenStatus> {
  const row = await repo.findByUserId(userId);
  return { hasToken: row !== null && row.revokedAt === null };
}
