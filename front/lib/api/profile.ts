'use client';
// Perfil del usuario autenticado (datos de la tabla User del CRM, no el portal cliente).
// GET /auth/me → campos de la cuenta del usuario logado.
// PATCH /auth/profile → editar nombre, apellido, teléfono.
import { apiFetch } from './client';

export interface AuthUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  /** Rol de membresía en el negocio activo (OWNER, ADMIN, EMPLOYEE, CLIENT, …). */
  role?: string;
}

/** Datos de perfil del usuario logado, extraídos de la respuesta de /auth/me. */
export async function getAuthProfile(): Promise<AuthUserProfile> {
  const data = await apiFetch<{ user: AuthUserProfile; role?: string }>('/auth/me');
  // `role` viene a nivel raíz en /auth/me (req.role), no dentro de `user`.
  return { ...data.user, role: data.role };
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/** Actualiza nombre, apellido y/o teléfono del usuario logado. */
export async function updateProfile(input: UpdateProfileInput): Promise<AuthUserProfile> {
  const data = await apiFetch<{ user: AuthUserProfile }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.user;
}
