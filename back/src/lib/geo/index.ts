import type { GeocoderPort } from './geocoder.js';
import { NominatimGeocoder } from './nominatim.js';

// Resuelve el adaptador de geocodificación activo. Por defecto Nominatim (gratis, sin key).
// Hueco de extensión: si se define GOOGLE_MAPS_API_KEY se podría enchufar un GoogleGeocoder
// sin tocar el resto del CRM (RNF-10). Se cachea una instancia (mantiene el throttle).
let instance: GeocoderPort | null = null;

export function resolveGeocoder(): GeocoderPort {
  if (!instance) instance = new NominatimGeocoder();
  return instance;
}

/** Sólo para tests: inyecta un geocoder de prueba. */
export function setGeocoder(g: GeocoderPort | null): void {
  instance = g;
}

export type { GeocoderPort, GeoResult, GeoQuery } from './geocoder.js';
export { haversineKm, isValidCoord, buildAddressQuery } from './geocoder.js';
