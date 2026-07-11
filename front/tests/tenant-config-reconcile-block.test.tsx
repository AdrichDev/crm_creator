// Test del cableado de reconciliación del kill switch (crm-tenant-block-scoping,
// tarea 4.4): openProject (tenant-config-context.tsx) debe invocar
// reconcileTenantBlock(id) tras fijar el nuevo negocio activo, para que un bloqueo
// obsoleto del negocio anterior no persista contra el recién activado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { reconcileMock } = vi.hoisted(() => ({ reconcileMock: vi.fn() }));
vi.mock('@/lib/tenant/blocked-state', () => ({
  reconcileTenantBlock: reconcileMock,
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => true,
  apiBaseUrl: () => 'http://test',
  apiFetch: apiFetchMock,
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  isAuthed: () => Promise.resolve(true),
  onAuthStateChange: () => () => {},
  BUSINESS_KEY: 'saas.business.id',
}));

import { TenantConfigProvider, useProjects } from '@/lib/tenant-config-context';
import { configFromVertical } from '@/lib/config/tenant-config';

const wrapper = ({ children }: { children: ReactNode }) => (
  <TenantConfigProvider>{children}</TenantConfigProvider>
);

beforeEach(() => {
  reconcileMock.mockClear();
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path === '/projects') {
      return [
        { id: 'biz-A', createdAt: '2026-01-01T00:00:00.000Z', config: configFromVertical('peluqueria', 'A') },
        { id: 'biz-B', createdAt: '2026-01-02T00:00:00.000Z', config: configFromVertical('peluqueria', 'B') },
      ];
    }
    return {};
  });
  // Salta la migración localStorage→Supabase (no interesa aquí).
  try { localStorage.setItem('saas.projects.migrated.v1', new Date().toISOString()); } catch { /* noop */ }
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe('openProject → reconcileTenantBlock', () => {
  it('invoca reconcileTenantBlock con el id del negocio recién activado', async () => {
    const { result } = renderHook(() => useProjects(), { wrapper });
    await waitFor(() => expect(result.current.projects).toHaveLength(2));

    act(() => { result.current.openProject('biz-B'); });

    expect(reconcileMock).toHaveBeenCalledWith('biz-B');
    // Y el scoping de datos quedó fijado ANTES de reconciliar (BUSINESS_KEY del back).
    expect(localStorage.getItem('saas.business.id')).toBe('biz-B');
  });

  it('cada cambio de negocio activo reconcilia con SU id', async () => {
    const { result } = renderHook(() => useProjects(), { wrapper });
    await waitFor(() => expect(result.current.projects).toHaveLength(2));

    act(() => { result.current.openProject('biz-A'); });
    act(() => { result.current.openProject('biz-B'); });

    expect(reconcileMock).toHaveBeenNthCalledWith(1, 'biz-A');
    expect(reconcileMock).toHaveBeenNthCalledWith(2, 'biz-B');
  });
});
