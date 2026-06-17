'use client';
// Sesión real contra el backend (reemplaza demo-auth). Guarda el JWT y el
// negocio activo en localStorage; el gate del AppShell usa la presencia del token.
import { apiFetch } from '@/lib/api/client';
import type { Role } from '@/lib/config/roles';

const TOKEN_KEY = 'saas.token';
const BUSINESS_KEY = 'saas.business.id';

export type MemberRole =
  | 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'RECEPTIONIST' | 'PROFESSIONAL' | 'ACCOUNTANT' | 'CLIENT';

interface LoginResponse {
  token: string;
  user: { id: string; email: string; firstName: string };
  memberships: { businessId: string; role: MemberRole }[];
}

/** Mapea el rol de membership del back al perfil de vista del front. */
export function roleFromMembership(role?: MemberRole): Role {
  if (role === 'OWNER' || role === 'ADMIN') return 'admin';
  if (role === 'CLIENT') return 'cliente';
  return 'trabajador';
}

/** Login real. Guarda token + businessId. Devuelve el rol de vista. Lanza con mensaje del back. */
export async function login(email: string, password: string): Promise<Role> {
  const res = await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  try {
    localStorage.setItem(TOKEN_KEY, res.token);
    const biz = res.memberships?.[0]?.businessId;
    if (biz) localStorage.setItem(BUSINESS_KEY, biz);
  } catch { /* noop */ }
  return roleFromMembership(res.memberships?.[0]?.role);
}

export function isAuthed(): boolean {
  try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; }
}

export function logout(): void {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(BUSINESS_KEY); } catch { /* noop */ }
}
