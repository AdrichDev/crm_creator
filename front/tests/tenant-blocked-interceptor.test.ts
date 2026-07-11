// Unit test del interceptor del kill switch (crm-tenant-block-scoping, tarea 3.3).
// Verifica que apiFetch (lib/api/client.ts):
//   - discrimina por el CÓDIGO del body, no por el status a secas;
//   - acota el bloqueo al businessId enviado como x-business-id (rutas de negocio);
//   - NUNCA bloquea desde rutas de plataforma (allowlist: /auth, /tenant-status,
//     /tenant-config, /service/operator) — OperaOS no se suspende.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// La sesión se mockea: el interceptor no debe depender de Supabase real.
vi.mock('@/lib/auth/session', () => ({
  getAccessToken: async () => 'test-token',
  getActiveBusinessId: () => 'biz-A',
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

describe('interceptor de bloqueo del tenant (acotado por negocio)', () => {
  it('423 tenant_suspended en ruta de negocio → bloqueo con el businessId enviado', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(423, 'tenant_suspended'),
    );

    await expect(apiFetch('/customers')).rejects.toThrow();
    expect(getTenantBlocked()).toEqual({ variant: 'suspended', businessId: 'biz-A' });
  });

  it('410 tenant_terminated en ruta de negocio → variante "terminated" con businessId', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(410, 'tenant_terminated'),
    );

    await expect(apiFetch('/clients')).rejects.toThrow();
    expect(getTenantBlocked()).toEqual({ variant: 'terminated', businessId: 'biz-A' });
  });

  it('423 tenant_suspended en /auth/me → NO bloquea (ruta de plataforma)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(423, 'tenant_suspended'),
    );

    await expect(apiFetch('/auth/me')).rejects.toThrow();
    expect(getTenantBlocked()).toBeNull();
  });

  it('410 tenant_terminated en rutas de plataforma → NO bloquea', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(410, 'tenant_terminated'),
    );

    for (const path of ['/tenant-status', '/tenant-config/algo', '/service/operator/negocios']) {
      await expect(apiFetch(path)).rejects.toThrow();
      expect(getTenantBlocked()).toBeNull();
    }
  });

  it('410 login_moved → NO bloquea (otros 410 del carril auth exentos)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      errorResponse(410, 'login_moved'),
    );

    await expect(apiFetch('/auth/login')).rejects.toThrow();
    expect(getTenantBlocked()).toBeNull();
  });
});
