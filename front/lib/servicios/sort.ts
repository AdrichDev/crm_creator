import type { Servicio } from '@/lib/mock/data';

// Ordenación por cabecera de Servicios y tarifas (servicio/categoría/duración/precio).
// `duracion`/`precio` son SIEMPRE numéricas aunque `precio` (Decimal de Prisma) llegue como
// STRING vía JSON en modo API (p. ej. "180.00"): comparar por tipo runtime ordenaba
// alfabéticamente ("180" < "45") en vez de numéricamente. Se fuerza Number() para esas
// columnas sin mirar el tipo; `nombre`/`categoria` siempre se comparan como texto.
export type ServicioSortKey = 'nombre' | 'categoria' | 'duracion' | 'precio';
const NUMERIC_SORT_KEYS = new Set<ServicioSortKey>(['duracion', 'precio']);

export function sortServicios(rows: Servicio[], key: ServicioSortKey, dir: 'asc' | 'desc'): Servicio[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = (a as unknown as Record<ServicioSortKey, unknown>)[key];
    const bv = (b as unknown as Record<ServicioSortKey, unknown>)[key];
    if (NUMERIC_SORT_KEYS.has(key)) return (Number(av) - Number(bv)) * m;
    return String(av ?? '').localeCompare(String(bv ?? ''), 'es', { sensitivity: 'base' }) * m;
  });
}
