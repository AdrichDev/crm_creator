// Unit test del interceptor del kill switch (crm-tenant-lifecycle-gate WU4, tarea 4.3).
// Verifica que apiFetch (lib/api/client.ts) discrimina por el CÓDIGO del body, no por
// el status a secas:
//   - 423 tenant_suspended  → estado global "suspended" (monta blocked-screen).
//   - 410 tenant_terminated → estado global "terminated" (variante cuenta cerrada).
//   - 410 login_moved       → NO bloquea (carril auth exento).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// La sesión se mockea: el interceptor no debe depender de Supabase real.
vi.mock('@/lib/auth/session', () => ({
  getAccessToken: async () => 'test-token',
  getActiveBusinessId: () => 'biz-1',
}));

import { apiFetch } from '@/lib/api/client';
import { getTenantBlocked, setTenantBlocked } from '@/lib/tenant/blocked-state';

// Respuesta de error simulada tal como la parsea apiFetch (body.error.code).
function errorResponse(status: number, code: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message: `stub ${code}` } }),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000';
  setTenantBlocked(null); // reset del store singleton entre casos
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('interceptor de bloqueo del tenant', () => {
  it('423 tenant_suspended → estado global "suspended"', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(423, 'tenant_suspended'),
    );

    await expect(apiFetch('/clients')).rejects.toThrow();
    expect(getTenantBlocked()).toBe('suspended');
  });

  it('410 tenant_terminated → estado global "terminated" (variante cerrada)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(410, 'tenant_terminated'),
    );

    await expect(apiFetch('/clients')).rejects.toThrow();
    expect(getTenantBlocked()).toBe('terminated');
  });

  it('410 login_moved → NO bloquea (carril auth exento)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(410, 'login_moved'),
    );

    await expect(apiFetch('/auth/login')).rejects.toThrow();
    expect(getTenantBlocked()).toBeNull();
  });
});
