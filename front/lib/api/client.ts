'use client';
// Cliente REST del backend OperaOS. Activo solo si NEXT_PUBLIC_API_URL está definido.

export function apiBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL || null;
}
export function isApiEnabled(): boolean {
  return Boolean(apiBaseUrl());
}

function token(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('saas.token');
}
function businessId(): string | null {
  // En el CRM generado, el negocio puede venir baked como NEXT_PUBLIC_BUSINESS_ID
  // (necesario para el auto-registro de cliente, que ocurre antes del login).
  const env = process.env.NEXT_PUBLIC_BUSINESS_ID || null;
  if (typeof window === 'undefined') return env;
  return window.localStorage.getItem('saas.business.id') || env;
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new Error('API no configurada');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  const t = token(); if (t) headers.Authorization = `Bearer ${t}`;
  const b = businessId(); if (b) headers['x-business-id'] = b;
  const res = await fetch(`${base}/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
