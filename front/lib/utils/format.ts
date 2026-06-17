// Formateadores compartidos del CRM. Evita duplicar `eur`/`pad`/`dateStr` por página.

/** Importe en euros sin decimales: 1234 → "€1.234". */
export const eur = (n: number): string => '€' + n.toLocaleString('es-ES', { maximumFractionDigits: 0 });

/** Dos dígitos con cero a la izquierda: 5 → "05". */
export const pad = (n: number): string => String(n).padStart(2, '0');

/** Fecha 'YYYY-MM-DD' desde año, mes (0-based) y día. */
export const dateStr = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`;
