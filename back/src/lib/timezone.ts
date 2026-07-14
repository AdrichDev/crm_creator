// ---------------------------------------------------------------------------
// Conversión de zona horaria en el borde con Google Calendar.
//
// El CRM usa la convención "wall-clock-como-UTC" (availability.ts): las horas se
// guardan y se leen con los métodos UTC del Date, SIN conversión de zona — la hora
// escrita es la que se guarda y se muestra, sea cual sea la TZ del proceso Node.
// Google Calendar, en cambio, habla de instantes reales con offset (RFC3339). En el
// ÚNICO punto donde los datos cruzan hacia/desde Google hay que convertir de forma
// explícita usando la TZ del negocio (Location.zonaHoraria, default Europe/Madrid).
// Intl.DateTimeFormat resuelve el offset correcto por-instante, así que el DST
// (verano +02:00 / invierno +01:00 en Madrid) se maneja solo.
// ---------------------------------------------------------------------------

/**
 * Instante real → Date cuyos campos UTC son el wall-clock de ese instante en `timeZone`.
 * Ej.: instante `2026-07-10T08:00:00Z` con tz `Europe/Madrid` (verano, +02:00) →
 * `2026-07-10T10:00:00.000Z`. Ese Date, leído con getUTCHours(), da 10 — la hora local real.
 * Se usa al IMPORTAR eventos de Google (que llegan con offset) a la convención del CRM.
 */
export function instantToWallClockUtc(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23', // fuerza 00-23 (evita el '24:00' de medianoche de algunos engines)
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00';

  const hour = get('hour') === '24' ? '00' : get('hour'); // salvaguarda extra
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}.000Z`,
  );
}

/**
 * Wall-clock-como-UTC → string RFC3339 SIN offset (naive local), para enviarlo a Google
 * junto con un campo `timeZone` explícito. Google interpreta un `dateTime` sin offset en
 * la `timeZone` dada, colocando el evento a la hora de pared correcta.
 * Ej.: Date `2026-07-10T10:00:00.000Z` → `'2026-07-10T10:00:00'`.
 * Se usa al EXPORTAR citas del CRM (wall-clock-as-UTC) hacia Google.
 */
export function wallClockUtcToNaive(d: Date): string {
  return d.toISOString().slice(0, 19); // 'YYYY-MM-DDTHH:mm:ss'
}
