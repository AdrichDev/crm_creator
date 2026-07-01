import { describe, it, expect } from 'vitest';
import { buildRouteUrl, hasValidCoords } from '@/lib/comercial/maps-link';

describe('maps-link (RF-15)', () => {
  it('genera deep-link de Google Maps con coordenadas válidas', () => {
    const url = buildRouteUrl({ latitud: 40.4168, longitud: -3.7038 });
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=40.4168,-3.7038');
  });

  it('devuelve null sin coordenadas (bloquea el botón "Ir")', () => {
    expect(buildRouteUrl({ latitud: null, longitud: null })).toBeNull();
    expect(buildRouteUrl({})).toBeNull();
  });

  it('devuelve null con coordenadas fuera de rango', () => {
    expect(buildRouteUrl({ latitud: 200, longitud: 0 })).toBeNull();
    expect(hasValidCoords({ latitud: 91, longitud: 0 })).toBe(false);
    expect(hasValidCoords({ latitud: 40, longitud: -3 })).toBe(true);
  });
});
