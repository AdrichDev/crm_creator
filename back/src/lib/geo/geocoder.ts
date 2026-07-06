// Puerto de geocodificación (RNF-10: integración externa desacoplada). El CRM no depende
// de un proveedor concreto; se enchufa un adaptador (Nominatim por defecto; Google a futuro).

export interface GeoResult {
  lat: number;
  lng: number;
}

export interface GeoQuery {
  direccion?: string | null;
  /** Número de portal estructurado (crm-operaos 9.2). Opcional: filas antiguas lo llevan embebido en `direccion`. */
  numero?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  codigoPostal?: string | null;
}

export interface GeocoderPort {
  /** Devuelve coordenadas o null si la dirección no resuelve. No debe lanzar por "no encontrado". */
  geocode(q: GeoQuery): Promise<GeoResult | null>;
}

/**
 * Compone una cadena de búsqueda a partir de los campos de dirección disponibles.
 * Cambio ADITIVO (crm-operaos 9.2): si hay `numero` estructurado se anexa a la calle
 * ("Calle Mayor 5"); si `numero` es null/vacío (filas antiguas con el número embebido
 * en `direccion`), la query es EXACTAMENTE la de siempre — cero regresión geo.
 */
export function buildAddressQuery(q: GeoQuery): string {
  const direccion = (q.direccion ?? '').trim();
  const numero = (q.numero ?? '').trim();
  const calle = direccion && numero ? `${direccion} ${numero}` : direccion;
  return [calle, q.codigoPostal, q.localidad, q.provincia]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/** Coordenada válida: números finitos dentro de rango geográfico. */
export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/** Distancia aproximada en km entre dos puntos (fórmula de Haversine). RF-18 (cercanía). */
export function haversineKm(a: GeoResult, b: GeoResult): number {
  const R = 6371; // radio terrestre km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
