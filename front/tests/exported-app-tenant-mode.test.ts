// Tests de la fase 3.4 (Modo app exportada).
//
// Cubre:
// (a) BAKED_TENANT_CONFIG decodifica base64 correctamente aunque la config
//     traiga colores hex (`#...`) — regresión del bug de gate 3.V (dotenv
//     truncaba el JSON crudo por el `#`).
// (b) GENERATED_TENANT deriva de BAKED_TENANT_CONFIG (app exportada arranca
//     como LA APP DEL TENANT) y resolveHomeRedirectPath() manda a /panel.
//     Sin la env var, todo el comportamiento normal queda intacto.
import { describe, it, expect, beforeEach, vi } from 'vitest';

function toBase64(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64');
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('BAKED_TENANT_CONFIG (base64, fase 3.4 fix)', () => {
  it('decodifica y parsea la config aunque tenga colores hex (#) — bug de gate 3.V', async () => {
    const cfg = {
      business: { name: 'EDM San Blas', vertical: 'centro-deportivo' },
      modules: {},
      workerChips: {},
      terminology: {},
      branding: { primary: '#1E90FF', secondary: '#FF00AA', logoText: 'EDM' },
    };
    vi.stubEnv('NEXT_PUBLIC_TENANT_JSON', toBase64(JSON.stringify(cfg)));

    const { BAKED_TENANT_CONFIG } = await import('@/lib/config/tenant-config');
    expect(BAKED_TENANT_CONFIG).not.toBeNull();
    expect(BAKED_TENANT_CONFIG?.business.name).toBe('EDM San Blas');
    expect(BAKED_TENANT_CONFIG?.branding.primary).toBe('#1E90FF');
  });

  it('null cuando la env var esta ausente (dev/normal intacto)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_JSON', '');
    const { BAKED_TENANT_CONFIG } = await import('@/lib/config/tenant-config');
    expect(BAKED_TENANT_CONFIG).toBeNull();
  });

  it('null si el base64 decodifica a JSON invalido (no revienta el build)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_JSON', toBase64('{ esto no es json'));
    const { BAKED_TENANT_CONFIG } = await import('@/lib/config/tenant-config');
    expect(BAKED_TENANT_CONFIG).toBeNull();
  });
});

describe('GENERATED_TENANT deriva de BAKED_TENANT_CONFIG (app exportada = app del tenant)', () => {
  it('con BAKED presente, GENERATED_TENANT expone la misma config', async () => {
    const cfg = {
      business: { name: 'EDM San Blas', vertical: 'centro-deportivo' },
      modules: {},
      workerChips: {},
      terminology: {},
      branding: { primary: '#1E90FF', secondary: '#FF00AA', logoText: 'EDM' },
    };
    vi.stubEnv('NEXT_PUBLIC_TENANT_JSON', toBase64(JSON.stringify(cfg)));

    const { GENERATED_TENANT } = await import('@/lib/config/generated-tenant');
    expect(GENERATED_TENANT?.business.name).toBe('EDM San Blas');
  });

  it('sin BAKED, GENERATED_TENANT es null (consola normal, comportamiento intacto)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_JSON', '');
    const { GENERATED_TENANT } = await import('@/lib/config/generated-tenant');
    expect(GENERATED_TENANT).toBeNull();
  });
});

describe('resolveHomeRedirectPath (raiz "/" de la app exportada)', () => {
  it('con BAKED presente, redirige a /panel (consola/creador no se expone)', async () => {
    const cfg = {
      business: { name: 'EDM San Blas', vertical: 'centro-deportivo' },
      modules: {},
      workerChips: {},
      terminology: {},
      branding: { primary: '#1E90FF', secondary: '#FF00AA', logoText: 'EDM' },
    };
    vi.stubEnv('NEXT_PUBLIC_TENANT_JSON', toBase64(JSON.stringify(cfg)));

    const { resolveHomeRedirectPath } = await import('@/lib/config/home-redirect');
    expect(resolveHomeRedirectPath()).toBe('/panel');
  });

  it('sin BAKED, redirige a /dashboard (dev/normal intacto)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_JSON', '');
    const { resolveHomeRedirectPath } = await import('@/lib/config/home-redirect');
    expect(resolveHomeRedirectPath()).toBe('/dashboard');
  });
});
