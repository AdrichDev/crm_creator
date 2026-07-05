// Opciones de geolocalización para "Cerca de mí" (comercial de campo).
// enableHighAccuracy: sin esto el navegador puede resolver por IP/red (impreciso,
// a veces a varios km) en vez de GPS/WiFi. maximumAge: 0 evita reusar un fix viejo.
// Extraído a módulo aparte para poder testear la regresión sin renderizar la página.
export const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

/** Pide la posición actual del navegador con alta precisión. No-op si no hay soporte. */
export function pedirUbicacionActual(
  onOk: (pos: GeolocationPosition) => void,
  onErr: (err: GeolocationPositionError) => void,
): void {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(onOk, onErr, GEO_OPTIONS);
}
