// Helpers puros del mapa comercial que mezcla dos capas de puntos (crm-operaos 9.12):
// la cartera de CLIENTES (círculo relleno, color por estado/gasto) y los CONTACTOS
// (leads/prospectos: marcador con forma y color propios, tratamiento neutro).

// Color fijo de contacto: violeta, fuera de la paleta de estados de visita y de las
// categorías ABC (dorado/azul/gris) para que nunca se confunda con un cliente.
export const CONTACT_COLOR = '#a855f7';
// Borde del marcador de contacto (más oscuro que el relleno para reforzar la silueta).
export const CONTACT_STROKE = '#6b21a8';

/**
 * Clave del conjunto sobre el que se hace fitBounds. Incluye clientes Y contactos para
 * que el mapa reencuadre cuando cambie el conjunto TOTAL de puntos ubicados, pero NO en
 * cada selección o cambio de color (esos no alteran los ids). Los dos grupos se prefijan
 * ('c:'/'k:') para que un cliente y un contacto con el mismo id no se cancelen entre sí.
 * Función pura y testeable.
 */
export function buildBoundsKey(customerIds: string[], contactIds: string[]): string {
  const c = customerIds.map((id) => `c:${id}`);
  const k = contactIds.map((id) => `k:${id}`);
  return [...c, ...k].sort().join(',');
}

/** True si el punto tiene coordenadas válidas y geoEstado OK (pintable en el mapa). Pura. */
export function isMappable(p: { geoEstado: string; latitud: number | null; longitud: number | null }): boolean {
  return p.geoEstado === 'OK' && p.latitud != null && p.longitud != null;
}
