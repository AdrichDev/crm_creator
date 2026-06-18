'use client';
// Auth client: default schema (public/auth). Used for signInWithPassword, signOut,
// getSession, verifyOtp, updateUser. MUST NOT pin schema:'app' — auth.* lives in
// Supabase's own auth schema and requires the default client configuration.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function isSupabaseEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let _authClient: SupabaseClient | null | undefined;

/**
 * Supabase browser client for auth operations (singleton).
 * Uses default schema — required for supabase.auth.* to work correctly.
 * Returns null if env vars are not configured.
 */
export function getAuthClient(): SupabaseClient | null {
  if (_authClient !== undefined) return _authClient;
  if (!isSupabaseEnabled()) { _authClient = null; return null; }
  _authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    },
  );
  return _authClient;
}

/** Reset the singleton (useful for testing). */
export function _resetAuthClient(): void {
  _authClient = undefined;
}
