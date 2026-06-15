'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ¿Hay credenciales configuradas? Si no, la app funciona en modo local.
export function isSupabaseEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let _client: SupabaseClient | null | undefined;

/** Cliente Supabase (singleton) o null si aún no hay credenciales. */
export function getSupabase(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  if (!isSupabaseEnabled()) { _client = null; return _client; }
  // Esquema `app` (ver back/). Cast para evitar el genérico de esquema en tipos.
  const c = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    { db: { schema: 'app' } },
  ) as unknown as SupabaseClient;
  _client = c;
  return c;
}

/** Tenant activo. Hoy desde env/localStorage; al integrar auth, desde la sesión. */
export function getActiveTenantId(): string | null {
  if (typeof window !== 'undefined') {
    const ls = window.localStorage.getItem('saas.tenant.id');
    if (ls) return ls;
  }
  return process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || null;
}
