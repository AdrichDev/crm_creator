// ---------------------------------------------------------------------------
// Política de contraseña (compartida por set/change/reset).
// Endurecida (2026-06-26): mínimo ≥ 10 chars Y las 4 clases de caracteres
// (mayúscula, minúscula, número y símbolo especial).
// Portable, sin dependencias. El espejo en front es solo feedback: la
// validación de verdad ocurre aquí, en el servidor.
// ---------------------------------------------------------------------------
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordError = 'too_short' | 'needs_upper' | 'needs_lower' | 'needs_digit' | 'needs_special';

/** Devuelve null si la contraseña cumple la política, o un código de error. */
export function validatePassword(plain: string): PasswordError | null {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (!/[A-Z]/.test(plain)) return 'needs_upper';
  if (!/[a-z]/.test(plain)) return 'needs_lower';
  if (!/\d/.test(plain)) return 'needs_digit';
  if (!/[^A-Za-z0-9]/.test(plain)) return 'needs_special';
  return null;
}
