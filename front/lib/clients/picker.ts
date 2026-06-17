// Lógica pura del selector de clientes (orden, filtro, límite de visibles).
// Los clientes provienen de agents-agency vía /api/clients (proxy).

export interface ClientLite {
  id: string;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  cif?: string | null;
  direccion?: string | null;
  contacto?: string | null;
}

/** Máximo de clientes mostrados antes de que aparezca scroll. */
export const MAX_VISIBLE = 20;

/** Orden alfabético por nombre (es), case-insensitive. */
export function sortClientsByName(list: ClientLite[]): ClientLite[] {
  return [...list].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
}

/** Filtra por substring del nombre (case-insensitive). Vacío = todos. */
export function filterClientsByName(list: ClientLite[], term: string): ClientLite[] {
  const q = term.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => (c.nombre || '').toLowerCase().includes(q));
}

/** Aplica filtro + orden y devuelve {visibles, total, hayScroll}. */
export function prepareClientOptions(list: ClientLite[], term = ''): {
  ordenados: ClientLite[];
  total: number;
  hayScroll: boolean;
} {
  const filtrados = sortClientsByName(filterClientsByName(list, term));
  return { ordenados: filtrados, total: filtrados.length, hayScroll: filtrados.length > MAX_VISIBLE };
}
