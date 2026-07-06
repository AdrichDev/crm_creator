import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TenantConfigProvider, useProjects } from '@/lib/tenant-config-context';
import { configFromVertical } from '@/lib/config/tenant-config';

// Split de persistencia (UC-1):
//  - updateProject (onboarding "Guardar cambios") → PATCH /projects/:id (BD), id EXPLÍCITO.
//  - setConfig (copia de trabajo del panel /panel) → NUNCA toca la BD.

const seededConfig = configFromVertical('peluqueria', 'Original');

let failPatch = false;

const apiFetchMock = vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
  const method = init?.method ?? 'GET';
  if (method === 'GET' && path === '/projects') {
    return [{ id: 'biz-1', createdAt: '2026-01-01T00:00:00.000Z', config: seededConfig, business: undefined }];
  }
  if (method === 'PATCH' && path.startsWith('/projects/')) {
    if (failPatch) throw new Error('BD no disponible');
    const id = path.split('/')[2];
    return { id, config: JSON.parse(init!.body!).config };
  }
  return {};
});

vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => true,
  apiBaseUrl: () => 'http://test',
  apiFetch: (...a: unknown[]) => apiFetchMock(...(a as [string, { method?: string; body?: string }?])),
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  isAuthed: () => Promise.resolve(true),
  onAuthStateChange: () => () => {},
  BUSINESS_KEY: 'saas.business.id',
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <TenantConfigProvider>{children}</TenantConfigProvider>
);

function patchCalls() {
  return apiFetchMock.mock.calls.filter(([, i]) => (i as { method?: string } | undefined)?.method === 'PATCH');
}

beforeEach(() => {
  failPatch = false;
  apiFetchMock.mockClear();
  // Salta la migración localStorage→Supabase (no interesa aquí).
  try { localStorage.setItem('saas.projects.migrated.v1', new Date().toISOString()); } catch { /* noop */ }
});
afterEach(() => { cleanup(); localStorage.clear(); });

async function mountReady() {
  const hook = renderHook(() => useProjects(), { wrapper });
  await waitFor(() => expect(hook.result.current.projects).toHaveLength(1));
  return hook;
}

describe('tenant-config · split de persistencia', () => {
  it('updateProject persiste en BD con el id correcto y actualiza el estado local', async () => {
    const { result } = await mountReady();
    const cfg = configFromVertical('peluqueria', 'Editado');

    await act(async () => { await result.current.updateProject('biz-1', cfg); });

    const patches = patchCalls();
    expect(patches).toHaveLength(1);
    expect(patches[0][0]).toBe('/projects/biz-1');
    const body = JSON.parse((patches[0][1] as { body: string }).body);
    expect(body.config.business.name).toBe('Editado');
    // Estado local refleja el cambio guardado.
    expect(result.current.projects.find((p) => p.id === 'biz-1')!.config.business.name).toBe('Editado');
  });

  it('updateProject propaga el error si el PATCH falla (no traga la excepción)', async () => {
    const { result } = await mountReady();
    failPatch = true;
    const cfg = configFromVertical('peluqueria', 'Editado');

    await act(async () => {
      await expect(result.current.updateProject('biz-1', cfg)).rejects.toThrow('BD no disponible');
    });
  });

  it('setConfig (copia de trabajo del panel) NO hace PATCH a la BD', async () => {
    const { result } = await mountReady();
    act(() => { result.current.openProject('biz-1'); });
    const working = configFromVertical('peluqueria', 'PanelEfimero');

    act(() => { result.current.setConfig(working); });

    expect(patchCalls()).toHaveLength(0);
    // La copia de trabajo se aplica solo en memoria (config del proyecto activo).
    expect(result.current.config.business.name).toBe('PanelEfimero');
  });
});
