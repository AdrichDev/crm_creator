import { describe, it, expect, vi, afterEach } from 'vitest';
import { GEO_OPTIONS, pedirUbicacionActual } from '@/lib/comercial/geo';

// Regresión fix 9.5: "Cerca de mí" debe pedir alta precisión (GPS/WiFi), no dejar
// que el navegador resuelva por IP/red (impreciso, a veces a varios km).
describe('comercial/geo — precisión de "Cerca de mí" (fix 9.5)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('GEO_OPTIONS pide alta precisión, timeout acotado y sin caché de fix viejo', () => {
    expect(GEO_OPTIONS).toEqual({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  });

  it('pedirUbicacionActual invoca getCurrentPosition con enableHighAccuracy:true', () => {
    const getCurrentPosition = vi.fn();
    // @ts-expect-error -- stub mínimo de navigator.geolocation para el test.
    global.navigator.geolocation = { getCurrentPosition };

    const onOk = vi.fn();
    const onErr = vi.fn();
    pedirUbicacionActual(onOk, onErr);

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const [okCb, errCb, options] = getCurrentPosition.mock.calls[0];
    expect(okCb).toBe(onOk);
    expect(errCb).toBe(onErr);
    expect(options).toMatchObject({ enableHighAccuracy: true });
  });

  it('sin soporte de geolocalización, no lanza y no llama a los callbacks', () => {
    // @ts-expect-error -- simula navegador sin geolocalización.
    global.navigator.geolocation = undefined;
    const onOk = vi.fn();
    const onErr = vi.fn();
    expect(() => pedirUbicacionActual(onOk, onErr)).not.toThrow();
    expect(onOk).not.toHaveBeenCalled();
    expect(onErr).not.toHaveBeenCalled();
  });
});
