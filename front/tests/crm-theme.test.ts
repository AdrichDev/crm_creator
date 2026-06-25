import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveMode, loadMode } from '@/lib/theme/crm-theme';

describe('UC-8 · resolución de tema CRM (solo claro/oscuro)', () => {
  it('AC-8.1 una preferencia "system" legada se resuelve según el SO', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
  });
  it('AC-8.2 override manual gana sobre el SO', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
});

// --- Migración de la preferencia legada 'system' (loadMode persiste el resultado) ---
function mockBrowser(stored: string | null, prefersDark: boolean) {
  const store: Record<string, string> = {};
  if (stored !== null) store['crm-theme.mode.v1'] = stored;
  vi.stubGlobal('window', { matchMedia: () => ({ matches: prefersDark }) });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
  });
  return store;
}

describe('UC-8 · loadMode migra la preferencia legada', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('AC-8.3 "system" legado con SO oscuro → "dark" y se persiste', () => {
    const store = mockBrowser('system', true);
    expect(loadMode()).toBe('dark');
    expect(store['crm-theme.mode.v1']).toBe('dark'); // ya no es 'system' tras migrar
  });

  it('AC-8.4 "system" legado con SO claro → "light" y se persiste', () => {
    const store = mockBrowser('system', false);
    expect(loadMode()).toBe('light');
    expect(store['crm-theme.mode.v1']).toBe('light');
  });

  it('AC-8.5 sin preferencia → resuelve por SO y persiste', () => {
    const store = mockBrowser(null, true);
    expect(loadMode()).toBe('dark');
    expect(store['crm-theme.mode.v1']).toBe('dark');
  });

  it('AC-8.6 preferencia válida "light" se respeta sin tocar', () => {
    const store = mockBrowser('light', true);
    expect(loadMode()).toBe('light');
    expect(store['crm-theme.mode.v1']).toBe('light');
  });
});
