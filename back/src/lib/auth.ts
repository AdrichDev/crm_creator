import { jwtVerify, createRemoteJWKSet } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';

// Supabase projects now sign access tokens with ASYMMETRIC keys (ES256) and publish
// the public keys via JWKS. The legacy shared HS256 secret no longer applies here
// (token header alg = ES256, kid present). We verify against the project's JWKS
// endpoint, which also handles key rotation by `kid`. No shared secret needed.
const SUPABASE_BASE = env.supabaseUrl.replace(/\/+$/, '').replace(/\.$/, '');
const SUPABASE_ISSUER = `${SUPABASE_BASE}/auth/v1`;
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_ISSUER}/.well-known/jwks.json`));

// ---------------------------------------------------------------------------
// Supabase Auth integration.
// - verifySupabaseToken: verificación asimétrica ES256 contra el JWKS del proyecto
//   (los tokens de Supabase ya no usan el secreto compartido HS256; hay llamada de red
//   al endpoint JWKS, con caché y rotación por `kid`).
// - supabaseAdmin: service-role client for admin operations (createUser, signOut, etc.).
//   SERVICE_ROLE_KEY must NEVER be exposed to the browser.
// ---------------------------------------------------------------------------

export interface SupabaseTokenPayload {
  /** Subject = auth.users.id (UUID) */
  sub: string;
  email: string;
  role: string;
  /** `app_metadata.role` (only the service role can set it, e.g. 'operator'). Absent when not set. */
  appRole?: string;
}

/**
 * Pure mapping of a verified JWT payload → SupabaseTokenPayload.
 * Extracted so the claim-shape contract is unit-testable without crypto/network
 * (the JWKS verification itself is covered by integration against live Supabase).
 */
export function extractSupabaseClaims(payload: { sub?: unknown; email?: unknown; role?: unknown; app_metadata?: unknown }): SupabaseTokenPayload {
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Token payload missing sub');
  }
  const claims: SupabaseTokenPayload = {
    sub: payload.sub,
    email: (payload.email as string) ?? '',
    role: (payload.role as string) ?? 'authenticated',
  };
  // Solo app_metadata (no editable por el usuario); user_metadata.role se ignora a propósito.
  const appRole = (payload.app_metadata as { role?: unknown } | undefined)?.role;
  if (typeof appRole === 'string' && appRole) claims.appRole = appRole;
  return claims;
}

export async function verifySupabaseToken(token: string): Promise<SupabaseTokenPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ['ES256'],
    issuer: SUPABASE_ISSUER,
    audience: 'authenticated', // pin aud: solo tokens de usuario autenticado
  });
  return extractSupabaseClaims(payload);
}

/**
 * Supabase Admin client — service role, bypasses RLS.
 * Only used server-side for admin.createUser, admin.signOut, inviteUserByEmail, etc.
 * autoRefreshToken + persistSession disabled: stateless server usage.
 */
export const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
