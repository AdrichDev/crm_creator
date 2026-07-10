'use client';
// Lectura del estado de ciclo de vida del tenant (crm-tenant-lifecycle-gate WU4).
// GET /api/tenant-status está EXENTO del gate: aunque el negocio esté suspendido o
// cerrado responde 200 para que la pantalla de bloqueo pueda explicar el motivo.
// Reutiliza apiFetch (Bearer de sesión + x-business-id), no inventa un carril nuevo.
import { apiFetch, isApiEnabled } from '@/lib/api/client';

export type TenantLifecycle = 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'TERMINATED';

export interface TenantStatus {
  lifecycle: TenantLifecycle;
  graceUntil?: string | null;
}

/**
 * Consulta el estado del tenant. Devuelve null si la API no está configurada o si
 * la llamada falla (la pantalla de bloqueo cae entonces a un copy genérico).
 */
export async function fetchTenantStatus(): Promise<TenantStatus | null> {
  if (!isApiEnabled()) return null;
  try {
    return await apiFetch<TenantStatus>('/tenant-status');
  } catch {
    return null;
  }
}
