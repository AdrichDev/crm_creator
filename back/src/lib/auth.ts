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
// - verifySupabaseToken: stateless HS256 JWT verification (no network call).
// - supabaseAdmin: service-role client for admin operations (createUser, signOut, etc.).
//   SERVICE_ROLE_KEY must NEVER be exposed to the browser.
// ---------------------------------------------------------------------------

export interface SupabaseTokenPayload {
  /** Subject = auth.users.id (UUID) */
  sub: string;
  email: string;
  role: string;
}

/**
 * Verifies a Supabase-issued access token against the project JWKS (ES256, asymmetric).
 * Throws on invalid/expired token — caller must catch and return 401.
 * Returns { sub, email, role } — sub is the auth.users UUID.
 */
/**
 * Pure mapping of a verified JWT payload → SupabaseTokenPayload.
 * Extracted so the claim-shape contract is unit-testable without crypto/network
 * (the JWKS verification itself is covered by integration against live Supabase).
 */
export function extractSupabaseClaims(payload: { sub?: unknown; email?: unknown; role?: unknown }): SupabaseTokenPayload {
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Token payload missing sub');
  }
  return {
    sub: payload.sub,
    email: (payload.email as string) ?? '',
    role: (payload.role as string) ?? 'authenticated',
  };
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
