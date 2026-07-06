// Formateadores compartidos del CRM. Evita duplicar `eur`/`pad`/`dateStr` por página.

/** Importe en euros sin decimales, símbolo € DETRÁS (convención AA): 1234 → "1.234 €". */
export const eur = (n: number): string => n.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';

/** Importe con el símbolo € DETRÁS y 2 decimales: 1234.5 → "1.234,50 €" (ficha de cliente). */
export const eurSuffix = (n: number): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

/** Dos dígitos con cero a la izquierda: 5 → "05". */
export const pad = (n: number): string => String(n).padStart(2, '0');

/** Fecha 'YYYY-MM-DD' desde año, mes (0-based) y día. */
export const dateStr = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Código corto visual "Id Cliente" derivado del id real (no existe columna `codigo`
 * en el modelo Customer, y no se migra el schema solo para esto). Puramente de
 * presentación: toma los últimos 6 caracteres del id (cuid en API, número en modo
 * generador) en mayúsculas.
 */
export const shortClienteId = (id: string | number): string => 'CLI-' + String(id).slice(-6).toUpperCase();
