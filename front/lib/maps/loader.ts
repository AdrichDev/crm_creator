// Carga perezosa y única de la Google Maps JS API vía @googlemaps/js-api-loader.
// crm-tenant-secrets-runtime-maps: la API key YA NO se lee de `process.env` en build-time
// (NEXT_PUBLIC_* se hornea al buildear en Vercel — el secreto guardado en BD tras ese build
// nunca se veía sin redeploy). Se resuelve en RUNTIME contra `GET /tenant-config`
// (`publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`), cacheada en memoria de módulo por
// carga de página (mismo alcance que el flag `configured`).
// Tras `loadGoogleMaps`, el namespace global `google.maps.*` queda disponible por completo.

import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { apiFetch } from '@/lib/api/client';

let configured = false;

/** Mensaje lanzado por `loadGoogleMaps` cuando no hay clave resoluble. Exportado para que
 * los consumidores (p. ej. `MapaClientes`) puedan distinguir este fallo específico de
 * cualquier otro error de carga del SDK y mostrar su propio texto de "mapa no disponible". */
export const GOOGLE_MAPS_KEY_MISSING_MESSAGE = 'Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en la configuración del front';

/** Cache de módulo: `undefined` = aún no resuelto; `null` = resuelto SIN clave (no reintentar
 * en bucle en cada montaje); string = clave resuelta. */
let cachedKey: string | null | undefined;

/**
 * Resuelve la clave de Google Maps vía `GET /tenant-config` (auth de sesión + x-business-id,
 * mismo cliente REST que el resto del front). Cualquier fallo (red, 401/500, campo ausente)
 * se trata como "sin clave" — sin relanzar detalle, el caller decide el mensaje.
 */
export async function resolveGoogleMapsApiKey(): Promise<string | undefined> {
  if (cachedKey !== undefined) return cachedKey ?? undefined;
  try {
    const config = await apiFetch<{ publicEnvSecrets?: Record<string, string> }>('/tenant-config');
    cachedKey = config.publicEnvSecrets?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  } catch {
    cachedKey = null;
  }
  return cachedKey ?? undefined;
}

export async function loadGoogleMaps(): Promise<void> {
  const key = await resolveGoogleMapsApiKey();
  if (!key) {
    throw new Error(GOOGLE_MAPS_KEY_MISSING_MESSAGE);
  }
  if (!configured) {
    setOptions({ key, v: 'weekly' });
    configured = true;
  }
  // 'maps' aporta Map; 'marker' aporta Marker. Ambas pueblan el namespace global.
  await Promise.all([importLibrary('maps'), importLibrary('marker')]);
}
