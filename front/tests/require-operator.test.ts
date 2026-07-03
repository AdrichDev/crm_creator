// Unit tests for lib/server/require-operator.ts — isAuthedOperator.
// Mocks global.fetch (no live network) and 'server-only' (Next-only marker module).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 'server-only' lanza al importarse fuera de un server component de Next.
vi.mock('server-only', () => ({}));

// Import after mock setup
import { isAuthedOperator } from '@/lib/server/require-operator';

const SUPABASE_URL = 'https://proj.supabase.co';
const ANON_KEY = 'anon-key-123';

function makeReq(withToken = true): Request {
  return new Request('http://localhost:3002/api/ai/generate', {
    headers: withToken ? { authorization: 'Bearer fake-access-token' } : {},
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('isAuthedOperator', () => {
  it('returns true for 200 with app_metadata.role === "operator" (AC1)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ id: 'u1', email: 'op@test.com', app_metadata: { role: 'operator' } }),
    );

    await expect(isAuthedOperator(makeReq())).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: 'Bearer fake-access-token' },
      cache: 'no-store',
    });
  });

  it('returns false for 200 without app_metadata.role (AC2)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ id: 'u1', email: 'user@test.com', app_metadata: { provider: 'email' } }),
    );

    await expect(isAuthedOperator(makeReq())).resolves.toBe(false);
  });

  it('returns false for 200 with a different role (AC2)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ id: 'u1', app_metadata: { role: 'admin' } }),
    );

    await expect(isAuthedOperator(makeReq())).resolves.toBe(false);
  });

  it('ignores user_metadata.role trying to impersonate operator (AC2)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'u1',
        app_metadata: { provider: 'email' },
        user_metadata: { role: 'operator' },
      }),
    );

    await expect(isAuthedOperator(makeReq())).resolves.toBe(false);
  });

  it('returns false on 401 from Supabase (AC3)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ msg: 'invalid token' }, 401));

    await expect(isAuthedOperator(makeReq())).resolves.toBe(false);
  });

  it('returns false on 200 with non-JSON body (AC3)', async () => {
    mockFetch.mockResolvedValue(new Response('<!doctype html>not json', { status: 200 }));

    await expect(isAuthedOperator(makeReq())).resolves.toBe(false);
  });

  it('returns false when fetch throws (AC3)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    await expect(isAuthedOperator(makeReq())).resolves.toBe(false);
  });

  it('returns false without Authorization header and never calls fetch (AC3)', async () => {
    await expect(isAuthedOperator(makeReq(false))).resolves.toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns false when Supabase env vars are missing (AC3)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    await expect(isAuthedOperator(makeReq())).resolves.toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
