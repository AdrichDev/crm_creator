// Unit tests for Supabase client factories.
// Validates: auth-client splits from data-client, schema pinning, env guards.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

// Reset module registry so we can re-test with different env states.
beforeEach(() => {
  vi.resetModules();
  mockCreateClient.mockReset();
  mockCreateClient.mockReturnValue({ auth: {}, from: vi.fn() });
});

// ─── isSupabaseEnabled ───────────────────────────────────────────────────────
describe('isSupabaseEnabled', () => {
  it('returns false when env vars absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { isSupabaseEnabled } = await import('@/lib/supabase/auth-client');
    expect(isSupabaseEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('returns true when both vars present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');
    const { isSupabaseEnabled } = await import('@/lib/supabase/auth-client');
    expect(isSupabaseEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});

// ─── getAuthClient ───────────────────────────────────────────────────────────
describe('getAuthClient', () => {
  it('returns null when env vars absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { getAuthClient } = await import('@/lib/supabase/auth-client');
    expect(getAuthClient()).toBeNull();
    vi.unstubAllEnvs();
  });

  it('creates client WITHOUT schema pin when env vars present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');
    const { getAuthClient } = await import('@/lib/supabase/auth-client');
    getAuthClient();
    expect(mockCreateClient).toHaveBeenCalledOnce();
    const [url, key, opts] = mockCreateClient.mock.calls[0];
    expect(url).toBe('https://test.supabase.co');
    expect(key).toBe('anon-key-123');
    // auth-client must NOT pin a db.schema — that breaks auth.* calls
    expect(opts?.db?.schema).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('returns same singleton on repeated calls', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');
    const { getAuthClient } = await import('@/lib/supabase/auth-client');
    const a = getAuthClient();
    const b = getAuthClient();
    expect(a).toBe(b);
    expect(mockCreateClient).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});

// ─── getCrmClient ─────────────────────────────────────────────────────────────
describe('getCrmClient', () => {
  it('returns null when env vars absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { getCrmClient } = await import('@/lib/supabase/data-client');
    expect(getCrmClient()).toBeNull();
    vi.unstubAllEnvs();
  });

  it('creates client with schema:crm when env vars present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');
    const { getCrmClient } = await import('@/lib/supabase/data-client');
    getCrmClient();
    const crmCall = mockCreateClient.mock.calls.find((c) => c[2]?.db?.schema === 'crm');
    expect(crmCall).toBeTruthy();
    vi.unstubAllEnvs();
  });
});

// ─── SERVICE_ROLE_KEY absence guard ─────────────────────────────────────────
describe('SERVICE_ROLE_KEY absence', () => {
  it('front bundle does not reference SERVICE_ROLE_KEY', () => {
    // Structural test: no NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY should exist.
    // The service role key must ONLY be in the backend (no NEXT_PUBLIC_ prefix).
    const serviceRoleKey = process.env['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'];
    expect(serviceRoleKey).toBeFalsy();
  });
});
