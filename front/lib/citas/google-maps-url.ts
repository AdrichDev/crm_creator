// Builder de URLs de Google Maps a partir de una dirección en texto (AC3, WU3).
// PURO y testable: no hace llamadas a APIs externas ni usa API key embebida —
// el embed público de Google Maps (`/maps?q=...&output=embed`) funciona sin credenciales.
// Ver design.md ("Mapas: Google Maps URL/embed") y validation.md AC3/WU3.

const BASE_EMBED_URL = 'https://www.google.com/maps';
const BASE_SEARCH_URL = 'https://www.google.com/maps/search/?api=1';

function direccionValida(direccion?: string | null): direccion is string {
  return typeof direccion === 'string' && direccion.trim().length > 0;
}

// URL para <iframe> embebido sin API key (AC3: "mapa embebido ... usa Google Maps").
export function buildGoogleMapsEmbedUrl(direccion?: string | null): string | null {
  if (!direccionValida(direccion)) return null;
  return `${BASE_EMBED_URL}?q=${encodeURIComponent(direccion.trim())}&output=embed`;
}

// URL para enlace "abrir en Google Maps" (AC3: "enlace de ubicación").
export function buildGoogleMapsSearchUrl(direccion?: string | null): string | null {
  if (!direccionValida(direccion)) return null;
  return `${BASE_SEARCH_URL}&query=${encodeURIComponent(direccion.trim())}`;
}
