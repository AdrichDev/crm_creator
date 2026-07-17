'use client';
// Cliente del carril admin-PLATAFORMA para la config de la app Google OAuth CENTRAL
// (crm-central-oauth-admin-config). NO habla directo con el back: llama al proxy
// same-origin de Next (`/api/platform/oauth-config`), que valida al operador
// (Bearer de Supabase) e inyecta el service token server-side. Así el
// OPERATOR_SERVICE_TOKEN nunca llega al browser. El VALOR de una credencial nunca
// se recibe de vuelta: solo estado (configurado sí/no) o el veredicto de formato.
import { getAccessToken } from '@/lib/auth/session';

/** Campo del formulario ↔ estado configurado. El value nunca viaja de vuelta. */
export interface PlatformOAuthField {
  field: 'clientId' | 'clientSecret' | 'redirectUri';
  key: string;
  configured: boolean;
  updatedAt: string | null;
}

export interface PlatformOAuthConfig {
  config: PlatformOAuthField[];
}

/** Payload de guardado/prueba: los 3 campos, opcionales (vacío = usa env legacy). */
export interface PlatformOAuthInput {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface PlatformOAuthTestResult {
  ok: boolean;
  results: Array<{ field: string; ok: boolean; detail?: string }>;
}

export class PlatformOAuthApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'PlatformOAuthApiError';
    this.status = status;
    this.code = code;
  }
}

async function platformFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const t = await getAccessToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`/api/platform${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PlatformOAuthApiError(body?.error?.message ?? `Error ${res.status}`, res.status, body?.error?.code);
  }
  return res.json() as Promise<T>;
}

export function getPlatformOAuthConfig(): Promise<PlatformOAuthConfig> {
  return platformFetch<PlatformOAuthConfig>('/oauth-config', { method: 'GET' });
}

export function savePlatformOAuthConfig(input: PlatformOAuthInput): Promise<PlatformOAuthConfig> {
  return platformFetch<PlatformOAuthConfig>('/oauth-config', { method: 'PUT', body: JSON.stringify(input) });
}

export function testPlatformOAuthConfig(input: PlatformOAuthInput): Promise<PlatformOAuthTestResult> {
  return platformFetch<PlatformOAuthTestResult>('/oauth-config/test', { method: 'POST', body: JSON.stringify(input) });
}
