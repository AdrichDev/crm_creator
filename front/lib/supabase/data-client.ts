'use client';
// Data clients for direct Supabase reads governed by RLS policies.
// Two schema variants:
//   - getDataClient(): schema:'app' — for real-time subscriptions on the app schema.
//   - getCrmClient(): schema:'crm' — for client portal /me/* reads (RLS on crm.*).
// DO NOT use these clients for auth.* operations — use auth-client.ts instead.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled, getAuthClient } from './auth-client';

let _dataClient: SupabaseClient | null | undefined;
let _crmClient: SupabaseClient | null | undefined;

function makeClient(schema: string): SupabaseClient | null {
  if (!isSupabaseEnabled()) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      db: { schema },
      // Single source of truth for the session: reuse the auth-client's token via
      // the official `accessToken` option. This DISABLES this client's internal
      // GoTrueClient (no "Multiple GoTrueClient instances" warning, no second auth
      // storage) and guarantees every request carries the logged-in user's JWT,
      // so RLS policies on crm.* actually apply. Without this the data client would
      // run unauthenticated and RLS would return nothing.
      accessToken: async () => {
        const auth = getAuthClient();
        if (!auth) return null;
        const { data } = await auth.auth.getSession();
        return data.session?.access_token ?? null;
      },
    },
  ) as unknown as SupabaseClient;
}

/**
 * Supabase client for the 'app' schema (real-time data, existing tables).
 * Returns null if env vars are not configured.
 */
export function getDataClient(): SupabaseClient | null {
  if (_dataClient !== undefined) return _dataClient;
  _dataClient = makeClient('app');
  return _dataClient;
}

/**
 * Supabase client for the 'crm' schema.
 * Used by the client portal /me/* pages — reads are governed by RLS policies
 * (customer_read: userId=auth.uid(); staff_business_read: role<>CLIENT).
 * Returns null if env vars are not configured.
 */
export function getCrmClient(): SupabaseClient | null {
  if (_crmClient !== undefined) return _crmClient;
  _crmClient = makeClient('crm');
  return _crmClient;
}

/** Reset singletons (useful for testing). */
export function _resetDataClients(): void {
  _dataClient = undefined;
  _crmClient = undefined;
}
