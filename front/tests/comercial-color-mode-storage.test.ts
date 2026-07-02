import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadColorMode, saveColorMode } from '@/lib/comercial/color-mode-storage';

function mockStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
  });
  return store;
}

describe('color-mode-storage — persistencia del modo por tenant (WU1.3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin preferencia guardada → modo por defecto "estado" (sin regresión, AC7)', () => {
    mockStorage();
    expect(loadColorMode('tenant-1')).toBe('estado');
  });

  it('modo cambiado y recargado → se restaura (AC3)', () => {
    mockStorage();
    saveColorMode('tenant-1', 'gasto');
    expect(loadColorMode('tenant-1')).toBe('gasto');
  });

  it('clave escopada por tenant: dos tenants no se pisan la preferencia', () => {
    const store = mockStorage();
    saveColorMode('tenant-1', 'gasto');
    saveColorMode('tenant-2', 'estado');
    expect(loadColorMode('tenant-1')).toBe('gasto');
    expect(loadColorMode('tenant-2')).toBe('estado');
    expect(Object.keys(store)).toHaveLength(2);
  });

  it('sin tenantId (aún no resuelto) → no persiste, devuelve el default', () => {
    mockStorage();
    saveColorMode(null, 'gasto');
    expect(loadColorMode(null)).toBe('estado');
  });
});
