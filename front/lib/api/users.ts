'use client';
// Cliente del módulo de gestión de usuarios (/api/users). Solo admin.
import { apiFetch } from './client';

export type BackRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CLIENT';
export type AssignableRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
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

// Mapeo canónico MemberRole (back) → rol de vista front.
// ADMIN → admin; MANAGER/EMPLOYEE → trabajador. CLIENT no se gestiona aquí.
export function frontRole(role: BackRole): 'admin' | 'trabajador' {
  return role === 'ADMIN' ? 'admin' : 'trabajador';
}

export const ROLE_LABEL: Record<BackRole, string> = {
  ADMIN: 'Administrador', MANAGER: 'Manager', EMPLOYEE: 'Empleado', CLIENT: 'Cliente',
};

// Roles asignables desde la gestión de usuarios (desplegable). Orden de menor a mayor.
export const ASSIGNABLE_ROLES: { value: AssignableRole; label: string }[] = [
  { value: 'EMPLOYEE', label: 'Empleado' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Administrador' },
];

export const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Activo', invited: 'Invitado', disabled: 'Desactivado',
};
