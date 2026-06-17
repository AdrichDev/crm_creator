import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Política de contraseña (compartida por set/change/reset).
// Mínimo deliberadamente simple y portable (≥ 8 chars). El espejo en front es
// solo feedback: la validación de verdad ocurre aquí, en el servidor.
// ---------------------------------------------------------------------------
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordError = 'too_short';

/** Devuelve null si la contraseña cumple la política, o un código de error. */
export function validatePassword(plain: string): PasswordError | null {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN_LENGTH) return 'too_short';
  return null;
}

// ---------------------------------------------------------------------------
// Tokens de invitación / reset.
// El token en claro es alta entropía (32 bytes → base64url). En BD solo se
// guarda su SHA-256; el claro únicamente viaja en el enlace del email.
// ---------------------------------------------------------------------------
const TOKEN_BYTES = 32;

/** Genera un token de un solo uso: { token } en claro y su hash para la BD. */
export function generateAuthToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** SHA-256 hex del token en claro. Determinista → permite lookup indexado por hash. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// TTL por propósito (ms). Invitación más larga (el usuario puede tardar en abrir
// el email de alta); reset corto por seguridad.
export const TOKEN_TTL_MS = {
  invite: 7 * 24 * 60 * 60 * 1000, // 7 días
  reset: 30 * 60 * 1000,           // 30 minutos
} as const;
