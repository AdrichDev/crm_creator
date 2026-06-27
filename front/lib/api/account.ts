'use client';
// Operaciones de credenciales de la cuenta: cambio, invitación, recuperación.
import { apiFetch } from './client';

// Política espejo del back (lib/password.ts). Solo feedback en cliente; la
// validación de verdad ocurre en el servidor.
// Requisitos: mín. 12 caracteres + las 4 clases (mayúscula, minúscula, número, símbolo).
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordChecks {
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
}

/** Estado por requisito, para la leyenda viva (✗/✓) del formulario. */
export function passwordChecks(pwd: string): PasswordChecks {
  return {
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    digit: /\d/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
}

export function passwordPolicyError(pwd: string): string | null {
  if (pwd.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  const c = passwordChecks(pwd);
  if (!c.upper || !c.lower || !c.digit || !c.special) {
    return 'La contraseña debe incluir mayúscula, minúscula, número y símbolo especial.';
  }
  return null;
}

/** Usuario logueado cambia su contraseña. Invalida sus demás sesiones. */
export function changePassword(oldPassword: string, newPassword: string, repeatPassword: string): Promise<void> {
  return apiFetch<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword, repeatPassword }) });
}

/** Fija la contraseña inicial desde un enlace de invitación (token de la URL). */
export function setPassword(token: string, newPassword: string, repeatPassword: string): Promise<void> {
  return apiFetch<void>('/auth/set-password', { method: 'POST', body: JSON.stringify({ token, newPassword, repeatPassword }) });
}

/** Solicita recuperación. Respuesta SIEMPRE neutra (no revela si el email existe). */
export function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

/** Restablece la contraseña con el token de "olvidé mi contraseña". */
export function resetPassword(token: string, newPassword: string, repeatPassword: string): Promise<void> {
  return apiFetch<void>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword, repeatPassword }) });
}

/** Auto-registro de cliente. Respuesta neutra (no revela si el email existe). */
export function registerClient(input: { firstName: string; email: string; username: string; phone: string }): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/register-client', { method: 'POST', body: JSON.stringify(input) });
}

/** Verifica el email del cliente y fija su contraseña (token del enlace). */
export function verifyEmail(token: string, newPassword: string, repeatPassword: string): Promise<void> {
  return apiFetch<void>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token, newPassword, repeatPassword }) });
}
