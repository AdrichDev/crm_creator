'use client';
// Cliente REST de /tenant-keys/:businessId/secrets (crm-onboarding-tenant-keys).
//
// El `businessId` se interpola SIEMPRE en el path, a mano — a propósito NO se apoya en el
// header `x-business-id` que `apiFetch` adjunta automáticamente (ese refleja el negocio
// ACTIVO de la sesión). Aquí el negocio editado puede ser OTRO (p. ej. en el onboarding,
// antes de que el usuario cambie su negocio activo), y el back autoriza por Membership del
// :businessId del PATH, no por el header — ver back/src/routes/tenant-keys.ts.
import { apiFetch } from './client';

// crm-tenant-keys-freeform: era unión cerrada de 5 nombres — el catálogo pasó de gate a
// preset, así que el tipo se abre a cualquier nombre válido (el back sigue validando formato).
export type TenantSecretName = string;

export const KNOWN_PRESET_NAMES = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'DATABASE_URL',
] as const;

export interface TenantSecretSlot {
  name: string;
  label: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  envVarName: string | null;
  configured: boolean;
  updatedAt: string | null;
}

export interface TenantSecretTestResult {
  ok: boolean;
  provider: 'openai' | 'gemini' | 'anthropic' | 'maps' | 'database';
  detail?: string;
}

const base = (businessId: string) => `/tenant-keys/${businessId}/secrets`;

export function listSecrets(businessId: string): Promise<{ secrets: TenantSecretSlot[] }> {
  return apiFetch<{ secrets: TenantSecretSlot[] }>(base(businessId));
}

export function upsertSecret(businessId: string, name: TenantSecretName, value: string): Promise<TenantSecretSlot> {
  return apiFetch<TenantSecretSlot>(`${base(businessId)}/${name}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export function deleteSecret(businessId: string, name: TenantSecretName): Promise<TenantSecretSlot> {
  return apiFetch<TenantSecretSlot>(`${base(businessId)}/${name}`, { method: 'DELETE' });
}

export function testSecret(businessId: string, name: TenantSecretName, value?: string): Promise<TenantSecretTestResult> {
  return apiFetch<TenantSecretTestResult>(`${base(businessId)}/${name}/test`, {
    method: 'POST',
    body: JSON.stringify(value === undefined ? {} : { value }),
  });
}
