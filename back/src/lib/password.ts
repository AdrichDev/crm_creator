// ---------------------------------------------------------------------------
// Política de contraseña (compartida por set/change/reset).
// Endurecida (2026-06-17): mínimo ≥ 12 chars Y variedad (≥1 letra y ≥1 dígito).
// Portable, sin dependencias. El espejo en front es solo feedback: la
// validación de verdad ocurre aquí, en el servidor.
// ---------------------------------------------------------------------------
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordError = 'too_short' | 'needs_variety';

/** Devuelve null si la contraseña cumple la política, o un código de error. */
export function validatePassword(plain: string): PasswordError | null {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN_LENGTH) return 'too_short';
  const hasLetter = /[A-Za-z]/.test(plain);
  const hasDigit = /\d/.test(plain);
  if (!hasLetter || !hasDigit) return 'needs_variety';
  return null;
}
