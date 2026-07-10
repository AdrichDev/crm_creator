'use client';
// Cliente del carril de OPERADOR (crm-tenant-lifecycle-gate WU5): palanca del kill
// switch. NO habla directo con el back: llama al proxy same-origin de Next
// (`/api/operator/**`), que valida al operador (Bearer de Supabase) e inyecta el
// service token server-side. Así el `OPERATOR_SERVICE_TOKEN` nunca llega al browser.
//
// Este cliente es independiente del `apiFetch` tenant-facing (client.ts): las
// llamadas de operador NO deben disparar el interceptor del kill switch (423/410
// de tenant), porque el operador vive fuera del gate.
import { getAccessToken } from '@/lib/auth/session';

export type TenantLifecycle = 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'TERMINATED';

/** Estado de ciclo de vida devuelto por `PUT .../lifecycle`. */
export interface LifecycleState {
  id: string;
  lifecycle: TenantLifecycle;
  graceUntil: string | null;
  suspendedAt: string | null;
}

/** Evento de auditoría de transición (histórico). */
export interface TenantStateEvent {
  fromState: TenantLifecycle;
  toState: TenantLifecycle;
  reason: string | null;
  actor: string;
  createdAt: string;
}

/**
 * Payload para fijar el estado destino. `graceUntil` (ISO) es obligatorio cuando
 * `state === 'GRACE'` (el back responde 400 grace_until_required si falta). El
 * front no aplica lógica de negocio: solo transporta el estado destino elegido.
 */
export interface SetLifecyclePayload {
  state: TenantLifecycle;
  reason?: string;
  graceUntil?: string;
}

/** Error tipado del carril de operador (conserva code + status del back). */
export class OperatorApiError extends Error {
  readonly code?: string;
  readonly status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'OperatorApiError';
    this.status = status;
    this.code = code;
  }
}

async function operatorFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const t = await getAccessToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`/api/operator${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new OperatorApiError(body?.error?.message ?? `Error ${res.status}`, res.status, body?.error?.code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Fija el estado destino del negocio (`ACTIVE | GRACE | SUSPENDED | TERMINATED`).
 * Cualquier estado → cualquier estado, sin transiciones ilegales (el back nunca
 * responde 409; solo 400 por payload inválido). Nunca borra datos.
 */
export function setBusinessLifecycle(businessId: string, payload: SetLifecyclePayload): Promise<LifecycleState> {
  return operatorFetch<LifecycleState>(`/businesses/${encodeURIComponent(businessId)}/lifecycle`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** Histórico de transiciones del negocio (más reciente primero). */
export function fetchBusinessStateEvents(businessId: string): Promise<TenantStateEvent[]> {
  return operatorFetch<{ events: TenantStateEvent[] }>(
    `/businesses/${encodeURIComponent(businessId)}/state-events`,
    { method: 'GET' },
  ).then((r) => r.events ?? []);
}
