'use client';
// Cliente del módulo de gestión de usuarios (/api/users). Solo admin.
import { apiFetch } from './client';

export type BackRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'RECEPTIONIST' | 'PROFESSIONAL' | 'ACCOUNTANT';
export type AssignableRole = 'ADMIN' | 'EMPLOYEE';
export type UserStatus = 'active' | 'invited' | 'disabled';

export interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  status: UserStatus;
  role: BackRole;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName?: string;
  role: AssignableRole;
}

export interface CreateUserResult {
  id: string;
  email: string;
  firstName: string;
  role: AssignableRole;
  status: string;
  emailSent: boolean;
  linked?: boolean;
}

export function listUsers(): Promise<ManagedUser[]> {
  return apiFetch<ManagedUser[]>('/users');
}

export function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  return apiFetch<CreateUserResult>('/users', { method: 'POST', body: JSON.stringify(input) });
}

export function updateUser(id: string, patch: { role?: AssignableRole; status?: UserStatus }): Promise<ManagedUser> {
  return apiFetch<ManagedUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteUser(id: string): Promise<void> {
  return apiFetch<void>(`/users/${id}`, { method: 'DELETE' });
}

export function resendInvite(id: string): Promise<{ emailSent: boolean }> {
  return apiFetch<{ emailSent: boolean }>(`/users/${id}/resend-invite`, { method: 'POST' });
}

// Mapeo canónico MemberRole (back) → rol front (AC-4.1).
// OWNER/ADMIN → admin; el resto → trabajador. `cliente` no tiene MemberRole.
export function frontRole(role: BackRole): 'admin' | 'trabajador' {
  return role === 'OWNER' || role === 'ADMIN' ? 'admin' : 'trabajador';
}

export const ROLE_LABEL: Record<BackRole, string> = {
  OWNER: 'Propietario', ADMIN: 'Administrador', MANAGER: 'Encargado',
  EMPLOYEE: 'Trabajador', RECEPTIONIST: 'Recepción', PROFESSIONAL: 'Profesional', ACCOUNTANT: 'Contabilidad',
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Activo', invited: 'Invitado', disabled: 'Desactivado',
};
