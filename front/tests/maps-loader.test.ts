// Unit tests de lib/maps/loader.ts (crm-tenant-secrets-runtime-maps, WU3).
// resolveGoogleMapsApiKey/loadGoogleMaps ya NO leen process.env: resuelven la clave en
// runtime vía GET /tenant-config (apiFetch), cacheada en memoria de módulo por carga de
// página. Se mockea apiFetch (patrón del repo, ver account-api.test.ts) y el SDK de Maps
// (@googlemaps/js-api-loader, imposible de cargar de verdad en jsdom).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockSetOptions = vi.fn();
const mockImportLibrary = vi.fn().mockResolvedValue(undefined);
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: (...args: unknown[]) => mockSetOptions(...args),
  importLibrary: (...args: unknown[]) => mockImportLibrary(...args),
}));

describe('lib/maps/loader — resolución runtime de la clave (WU3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cache de módulo (resolveGoogleMapsApiKey) y flag `configured` (loadGoogleMaps) viven
    // en el módulo real: se resetea reimportándolo con distinto query-string cache-buster.
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it('3.3 éxito: apiFetch devuelve publicEnvSecrets con la clave → loadGoogleMaps resuelve y llama setOptions UNA sola vez aunque se invoque dos veces (cache de módulo)', async () => {
    mockApiFetch.mockResolvedValue({ publicEnvSecrets: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'pk_live_runtime' } });
    const { loadGoogleMaps } = await import('@/lib/maps/loader');

    await loadGoogleMaps();
    await loadGoogleMaps();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/tenant-config');
    expect(mockSetOptions).toHaveBeenCalledTimes(1);
    expect(mockSetOptions).toHaveBeenCalledWith({ key: 'pk_live_runtime', v: 'weekly' });
  });

  it('3.4 campo ausente: apiFetch resuelve sin publicEnvSecrets → loadGoogleMaps rechaza con el mensaje esperado, sin llamar setOptions', async () => {
    mockApiFetch.mockResolvedValue({ publicEnvSecrets: {} });
    const { loadGoogleMaps } = await import('@/lib/maps/loader');

    await expect(loadGoogleMaps()).rejects.toThrow('Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en la configuración del front');
    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it('3.4 fetch fallido (red/401/500): loadGoogleMaps rechaza con el mismo mensaje que "sin clave", sin relanzar el detalle', async () => {
    mockApiFetch.mockRejectedValue(new Error('Error 401'));
    const { loadGoogleMaps } = await import('@/lib/maps/loader');

    await expect(loadGoogleMaps()).rejects.toThrow('Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en la configuración del front');
    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it('resolveGoogleMapsApiKey cachea el resultado en memoria de módulo: una sola llamada real a apiFetch tras resoluciones repetidas', async () => {
    mockApiFetch.mockResolvedValue({ publicEnvSecrets: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'pk_cache' } });
    const { resolveGoogleMapsApiKey } = await import('@/lib/maps/loader');

    const first = await resolveGoogleMapsApiKey();
    const second = await resolveGoogleMapsApiKey();

    expect(first).toBe('pk_cache');
    expect(second).toBe('pk_cache');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
