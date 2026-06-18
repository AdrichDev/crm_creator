'use client';
// REST client for the CRM backend (Express/Prisma).
// Bearer token sourced from Supabase session (access_token) — NOT from localStorage saas.token.
// x-business-id header retained for tenant scoping.
import { getAccessToken, getActiveBusinessId } from '@/lib/auth/session';

export function apiBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL || null;
}
export function isApiEnabled(): boolean {
  return Boolean(apiBaseUrl());
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new Error('API no configurada');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  // Token sourced from Supabase session (async), not from localStorage saas.token.
  const t = await getAccessToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  const b = getActiveBusinessId();
  if (b) headers['x-business-id'] = b;

  const res = await fetch(`${base}/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
