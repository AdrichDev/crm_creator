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

// Error tipado del back: conserva code (p.ej. 'oauth_no_configurado') y status HTTP
// para que la UI pueda distinguir errores concretos sin parsear el mensaje.
export class ApiError extends Error {
  readonly code?: string;
  readonly status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
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
    throw new ApiError(body?.error?.message ?? `Error ${res.status}`, res.status, body?.error?.code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Descarga binaria (Blob). Reutiliza base URL + Authorization + x-business-id de
// apiFetch, pero lee la respuesta como Blob en vez de JSON (apiFetch parsea JSON).
// Se usa para bajar el ZIP de exportación con el Bearer, que un <a href> no lleva.
export async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const base = apiBaseUrl();
  if (!base) throw new Error('API no configurada');

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  const t = await getAccessToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const b = getActiveBusinessId();
  if (b) headers['x-business-id'] = b;

  const res = await fetch(`${base}/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error?.message ?? `Error ${res.status}`, res.status, body?.error?.code);
  }
  return res.blob();
}

// Subida multipart (FormData). No fija Content-Type: el navegador añade el
// boundary correcto. Mantiene Authorization + x-business-id como apiFetch.
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new Error('API no configurada');

  const headers: Record<string, string> = {};
  const t = await getAccessToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const b = getActiveBusinessId();
  if (b) headers['x-business-id'] = b;

  const res = await fetch(`${base}/api${path}`, { method: 'POST', body: formData, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}
