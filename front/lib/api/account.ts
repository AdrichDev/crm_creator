'use client';
// Operaciones de credenciales de la cuenta: cambio, invitación, recuperación.
import { apiFetch } from './client';

// Política espejo del back (lib/password.ts). Solo feedback en cliente; la
// validación de verdad ocurre en el servidor.
export const PASSWORD_MIN_LENGTH = 12;

export function passwordPolicyError(pwd: string): string | null {
  if (pwd.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) return 'La contraseña debe incluir al menos una letra y un número.';
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
