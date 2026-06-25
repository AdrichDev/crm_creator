// Unit tests for lib/api/profile.ts — getAuthProfile and updateProfile.
// Mocks apiFetch so no live network or real backend is needed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock apiFetch ────────────────────────────────────────────────────────────
const mockApiFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiBaseUrl: () => 'http://localhost:4000',
  isApiEnabled: () => true,
}));

// Import after mock setup
import { getAuthProfile, updateProfile } from '@/lib/api/profile';

const FAKE_PROFILE = {
  id: 'user-uuid-1',
  email: 'user@test.com',
  firstName: 'Ana',
  lastName: 'García',
  phone: '600123456',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getAuthProfile ──────────────────────────────────────────────────────────
describe('getAuthProfile', () => {
  it('calls GET /auth/me and returns the user sub-object', async () => {
    mockApiFetch.mockResolvedValue({ user: FAKE_PROFILE });

    const result = await getAuthProfile();

    expect(mockApiFetch).toHaveBeenCalledWith('/auth/me');
    expect(result).toEqual(FAKE_PROFILE);
  });

  it('propagates errors from apiFetch', async () => {
    mockApiFetch.mockRejectedValue(new Error('Error 401'));

    await expect(getAuthProfile()).rejects.toThrow('Error 401');
  });
});

// ─── updateProfile ───────────────────────────────────────────────────────────
describe('updateProfile', () => {
  it('calls PATCH /auth/profile with the provided fields', async () => {
    const updated = { ...FAKE_PROFILE, firstName: 'María', phone: '611000000' };
    mockApiFetch.mockResolvedValue({ user: updated });

    const result = await updateProfile({ firstName: 'María', phone: '611000000' });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/profile',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'María', phone: '611000000' }),
      }),
    );
    expect(result).toEqual(updated);
  });

  it('sends all three fields when provided', async () => {
    mockApiFetch.mockResolvedValue({ user: FAKE_PROFILE });

    await updateProfile({ firstName: 'Ana', lastName: 'García', phone: '600123456' });

    const [, init] = mockApiFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ firstName: 'Ana', lastName: 'García', phone: '600123456' });
  });

  it('propagates 422 validation errors from the server', async () => {
    mockApiFetch.mockRejectedValue(new Error('Datos inválidos'));

    await expect(updateProfile({ firstName: '' })).rejects.toThrow('Datos inválidos');
  });
});
