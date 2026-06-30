// Helper de parseo y normalización de parámetros de paginación.
// Usado por crudRouter y routers custom (customers, bookings, employees).

export interface PaginationParams {
  page: number;   // >= 1
  limit: number;  // 1–100
  search: string; // trimmed, puede ser ""
}

/**
 * Normaliza los parámetros de paginación desde req.query.
 * - page: entero >= 1 (default 1; valores inválidos → 1)
 * - limit: entero 1–100 (default 20; > 100 → 100; inválido → 20)
 * - search: string trimado (default "")
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page  = Math.max(1, parseInt(String(query.page  ?? '1'),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20));
  const search = String(query.search ?? '').trim();
  return { page, limit, search };
}
