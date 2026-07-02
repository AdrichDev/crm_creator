// Serializador iCalendar (RFC 5545) puro — sin dependencias externas ni I/O.
// Genera un VCALENDAR con un VEVENT por ítem (cita o recordatorio). Usado por el
// endpoint GET /calendar/feed/:token.ics (crm-citas-google-calendar, WU2).

/** Ítem del feed: cita o recordatorio ya resueltos a texto plano (sin PII de más). */
export interface CalendarItem {
  /** Identificador estable: `booking-{id}@crm` o `reminder-{id}@crm`. */
  uid: string;
  /** SUMMARY del VEVENT. */
  title: string;
  start: Date;
  end: Date;
  /** DESCRIPTION opcional (p.ej. nombre del cliente). */
  description?: string;
  /** LOCATION opcional (dirección del local o del cliente). */
  location?: string;
}

const CRLF = '\r\n';
/** Límite de octetos por línea antes de plegar (RFC 5545 §3.1: 75 octetos + CRLF). */
const FOLD_LIMIT = 75;

/**
 * Escapa texto para un valor de propiedad ICS (RFC 5545 §3.3.11):
 * backslash, coma, punto y coma y saltos de línea.
 */
export function escapeText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Pliega una línea "NOMBRE:valor" a múltiplos de 75 octetos (UTF-8), como exige el
 * RFC. Cada línea continuación empieza con un único espacio.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= FOLD_LIMIT) return line;

  const chunks: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    // El límite del primer chunk es FOLD_LIMIT; los siguientes reservan 1 octeto
    // para el espacio de continuación.
    const limit = first ? FOLD_LIMIT : FOLD_LIMIT - 1;
    let end = Math.min(offset + limit, bytes.length);
    // No cortar un carácter UTF-8 multibyte a la mitad: retrocede hasta un byte
    // que no sea "continuación" (10xxxxxx).
    while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(bytes.subarray(offset, end).toString('utf8'));
    offset = end;
    first = false;
  }
  return chunks.map((chunk, i) => (i === 0 ? chunk : ` ${chunk}`)).join(CRLF);
}

/** Formatea una fecha a UTC "YYYYMMDDTHHMMSSZ" (formato DATE-TIME del RFC). */
export function formatDateUTC(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function prop(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

/**
 * Serializa una lista de ítems a un documento VCALENDAR completo.
 * `now` es inyectable para tests deterministas (por defecto `new Date()`).
 */
export function toICS(items: CalendarItem[], now: Date = new Date()): string {
  const dtstamp = formatDateUTC(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CRM//Calendar Feed//ES',
    'CALSCALE:GREGORIAN',
  ];

  for (const item of items) {
    lines.push('BEGIN:VEVENT');
    lines.push(prop('UID', escapeText(item.uid)));
    lines.push(prop('DTSTAMP', dtstamp));
    lines.push(prop('DTSTART', formatDateUTC(item.start)));
    lines.push(prop('DTEND', formatDateUTC(item.end)));
    lines.push(prop('SUMMARY', escapeText(item.title)));
    if (item.description) lines.push(prop('DESCRIPTION', escapeText(item.description)));
    if (item.location) lines.push(prop('LOCATION', escapeText(item.location)));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 exige CRLF como terminador de línea.
  return lines.join(CRLF) + CRLF;
}
