// Unit tests for lib/auth/session.ts — Supabase session wiring.
// All supabase calls are mocked; no live network or real Supabase needed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock supabase auth-client before importing session ─────────────────────
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUpdateUser = vi.fn();

const fakeSupabase = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    updateUser: mockUpdateUser,
  },
};

vi.mock('@/lib/supabase/auth-client', () => ({
  getAuthClient: () => fakeSupabase,
  isSupabaseEnabled: () => true,
  _resetAuthClient: vi.fn(),
}));

// Import after mock setup
import {
  login,
  logout,
  isAuthed,
  getAccessToken,
  getCurrentUser,
  onAuthStateChange,
  roleFromMembership,
  BUSINESS_KEY,
} from '@/lib/auth/session';

// ─── Fake localStorage ───────────────────────────────────────────────────────
const store: Record<string, string> = {};
const fakeStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage);
  Object.keys(store).forEach((k) => delete store[k]);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── roleFromMembership ──────────────────────────────────────────────────────
describe('roleFromMembership', () => {
  it('OWNER → admin', () => expect(roleFromMembership('OWNER')).toBe('admin'));
  it('ADMIN → admin', () => expect(roleFromMembership('ADMIN')).toBe('admin'));
  it('CLIENT → cliente', () => expect(roleFromMembership('CLIENT')).toBe('cliente'));
  it('EMPLOYEE → trabajador', () => expect(roleFromMembership('EMPLOYEE')).toBe('trabajador'));
  it('undefined → trabajador', () => expect(roleFromMembership(undefined)).toBe('trabajador'));
});

// ─── login ───────────────────────────────────────────────────────────────────
describe('login', () => {
  it('returns trabajador role when no metadata role', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok',
          user: { id: 'uuid-1', user_metadata: {} },
        },
      },
      error: null,
    });
    const role = await login('user@test.com', 'password123');
    expect(role).toBe('trabajador');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'user@test.com', password: 'password123' });
  });

  it('resolves role + active business from GET /me (source of truth), not metadata', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok',
          // metadata intentionally empty — role/business must NOT come from here
          user: { id: 'uuid-1', user_metadata: {} },
        },
      },
      error: null,
    });
    const prevApi = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://api.test';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ activeBusinessId: 'biz-999', role: 'CLIENT' }),
    });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const role = await login('client@test.com', 'password123');
      expect(role).toBe('cliente');
      expect(store[BUSINESS_KEY]).toBe('biz-999');
      // called the backend /auth/me with the Supabase access token
      expect(fetchMock).toHaveBeenCalledWith(
        'http://api.test/api/auth/me',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      );
    } finally {
      globalThis.fetch = prevFetch;
      process.env.NEXT_PUBLIC_API_URL = prevApi;
    }
  });

  it('throws on Supabase auth error', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    await expect(login('bad@test.com', 'wrong')).rejects.toThrow('Invalid login credentials');
  });

  it('throws when no session returned', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: null }, error: null });
    await expect(login('a@b.com', 'pwd')).rejects.toThrow('No se obtuvo sesión');
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────
describe('logout', () => {
  it('calls supabase signOut and clears localStorage', async () => {
    store[BUSINESS_KEY] = 'biz-1';
    mockSignOut.mockResolvedValue({ error: null });
    await logout();
    expect(mockSignOut).toHaveBeenCalled();
    expect(store[BUSINESS_KEY]).toBeUndefined();
  });

  it('best-effort: does not throw if signOut fails', async () => {
    mockSignOut.mockRejectedValue(new Error('network'));
    await expect(logout()).resolves.toBeUndefined();
  });
});

// ─── isAuthed ────────────────────────────────────────────────────────────────
describe('isAuthed', () => {
  it('returns true when session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    expect(await isAuthed()).toBe(true);
  });

  it('returns false when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await isAuthed()).toBe(false);
  });
});

// ─── getAccessToken ──────────────────────────────────────────────────────────
describe('getAccessToken', () => {
  it('returns access_token from session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'my-token' } } });
    expect(await getAccessToken()).toBe('my-token');
  });

  it('returns null when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await getAccessToken()).toBeNull();
  });
});

// ─── getCurrentUser ──────────────────────────────────────────────────────────
describe('getCurrentUser', () => {
  it('returns user id and email', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok', user: { id: 'uuid-123', email: 'u@test.com' } } },
    });
    const user = await getCurrentUser();
    expect(user).toEqual({ id: 'uuid-123', email: 'u@test.com' });
  });

  it('returns null when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await getCurrentUser()).toBeNull();
  });
});

// ─── onAuthStateChange ───────────────────────────────────────────────────────
describe('onAuthStateChange', () => {
  it('subscribes and returns unsubscribe fn', () => {
    const unsub = vi.fn();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: unsub } } });
    const off = onAuthStateChange(vi.fn());
    expect(mockOnAuthStateChange).toHaveBeenCalled();
    expect(typeof off).toBe('function');
    off();
    expect(unsub).toHaveBeenCalled();
  });
});
