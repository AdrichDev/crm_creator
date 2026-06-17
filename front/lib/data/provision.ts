'use client';
import type { TenantConfig } from '@/lib/config/tenant-config';

export interface ProvisionResult { ok: boolean; schema?: string; error?: string }

/** Crea el schema del proyecto en el Postgres del CRM (no bloquea si falla). */
export async function provisionTenant(id: string, cfg: TenantConfig): Promise<ProvisionResult> {
  try {
    const res = await fetch('/api/projects/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: cfg.business.name, vertical: cfg.business.vertical, modules: cfg.modules, clienteId: cfg.business.clienteId ?? null }),
    });
    const data = (await res.json()) as ProvisionResult;
    if (!res.ok || !data.ok) console.warn('[provision] no se pudo crear el schema:', data.error);
    return data;
  } catch (e) {
    console.warn('[provision] error de red al crear el schema:', e);
    return { ok: false, error: String(e) };
  }
}

/** Elimina el schema del proyecto (al borrarlo). */
export async function deprovisionTenant(id: string): Promise<ProvisionResult> {
  try {
    const res = await fetch(`/api/projects/provision?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    return (await res.json()) as ProvisionResult;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
