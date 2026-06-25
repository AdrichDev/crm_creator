// Unit tests for lib/api/account.ts — changePassword and forgotPassword.
// Confirms changePassword sends oldPassword in the request body (AC-C.2)
// and that the wrong_password error message passes through unmodified (AC-C.2).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock apiFetch ────────────────────────────────────────────────────────────
const mockApiFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiBaseUrl: () => 'http://localhost:4000',
  isApiEnabled: () => true,
}));

import { changePassword, forgotPassword, passwordPolicyError } from '@/lib/api/account';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ─── changePassword ──────────────────────────────────────────────────────────
describe('changePassword', () => {
  it('sends oldPassword, newPassword, repeatPassword to POST /auth/change-password', async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await changePassword('OldPass123', 'NewPass456!', 'NewPass456!');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/change-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ oldPassword: 'OldPass123', newPassword: 'NewPass456!', repeatPassword: 'NewPass456!' }),
      }),
    );
  });

  it('propagates "La contraseña actual es incorrecta" when server returns wrong_password (401)', async () => {
    // apiFetch throws Error with body.error.message from the server response.
    mockApiFetch.mockRejectedValue(new Error('La contraseña actual es incorrecta'));

    await expect(changePassword('WrongOld', 'NewPass456!', 'NewPass456!')).rejects.toThrow(
      'La contraseña actual es incorrecta',
    );
  });

  it('propagates weak-password error from server (422)', async () => {
    mockApiFetch.mockRejectedValue(new Error('La contraseña no cumple la política'));

    await expect(changePassword('OldPass123', 'weak', 'weak')).rejects.toThrow(/política/);
  });
});

// ─── forgotPassword ──────────────────────────────────────────────────────────
describe('forgotPassword', () => {
  it('sends email to POST /auth/forgot-password', async () => {
    mockApiFetch.mockResolvedValue({ message: 'ok' });

    await forgotPassword('user@test.com');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/forgot-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@test.com' }),
      }),
    );
  });

  it('returns the neutral server message', async () => {
    mockApiFetch.mockResolvedValue({ message: 'Si existe una cuenta, recibirás instrucciones.' });

    const result = await forgotPassword('any@test.com');

    expect(result.message).toMatch(/instrucciones/);
  });
});

// ─── passwordPolicyError ─────────────────────────────────────────────────────
describe('passwordPolicyError', () => {
  it('returns null for a valid password (≥12, letra+número)', () => {
    expect(passwordPolicyError('SecurePass123')).toBeNull();
    expect(passwordPolicyError('abcdefghij12')).toBeNull();
  });

  it('rejects passwords shorter than 12 characters', () => {
    expect(passwordPolicyError('Short1')).toMatch(/12/);
  });

  it('rejects passwords without a number', () => {
    expect(passwordPolicyError('OnlyLettersHere')).toMatch(/número/);
  });

  it('rejects passwords without a letter', () => {
    expect(passwordPolicyError('123456789012')).toMatch(/letra/);
  });
});
