// Enlace de ruta a Google Maps (RF-15). PURO y testable. El deep-link abre la app nativa
// de Google Maps en móvil (y la web en escritorio), independientemente del proveedor del
// mapa interactivo. Si el cliente no tiene coordenadas válidas, devuelve null → la UI
// bloquea el botón "Ir" y muestra aviso (§10.6 caso negativo).

export interface Located {
  latitud?: number | null;
  longitud?: number | null;
}

export function hasValidCoords(p: Located): boolean {
  const { latitud: lat, longitud: lng } = p;
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

// URL de navegación con destino cargado desde la ubicación actual del usuario.
export function buildRouteUrl(p: Located): string | null {
  if (!hasValidCoords(p)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${p.latitud},${p.longitud}`;
}

// URL de PIN/marcador simple: centra el mapa en las coordenadas sin pedir ruta desde la
// ubicación del usuario. Para la ficha de Clientes (icono del modal de info), a diferencia
// de `buildRouteUrl` (botón "Ir" de navegación del módulo comercial, que sigue siendo
// correcto ahí y no se toca).
export function buildPinUrl(p: Located): string | null {
  if (!hasValidCoords(p)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${p.latitud},${p.longitud}`;
}
