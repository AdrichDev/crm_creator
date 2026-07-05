// Carga perezosa y única de la Google Maps JS API vía @googlemaps/js-api-loader.
// La API key se expone al navegador con el prefijo NEXT_PUBLIC_ (ver front/.env.local).
// Tras `loadGoogleMaps`, el namespace global `google.maps.*` queda disponible por completo.

import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

let configured = false;

export function googleMapsApiKey(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

export async function loadGoogleMaps(): Promise<void> {
  const key = googleMapsApiKey();
  if (!key) {
    throw new Error('Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en la configuración del front');
  }
  if (!configured) {
    setOptions({ key, v: 'weekly' });
    configured = true;
  }
  // 'maps' aporta Map; 'marker' aporta Marker. Ambas pueblan el namespace global.
  await Promise.all([importLibrary('maps'), importLibrary('marker')]);
}
