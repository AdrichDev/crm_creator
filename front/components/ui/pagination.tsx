'use client';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

/**
 * Paginación simple: botones Anterior/Siguiente + texto informativo.
 * Se oculta automáticamente si totalPages <= 1.
 */
export function Pagination({ page, totalPages, total, limit: _limit, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-[var(--panel-muted)]">
      <span>Página {page} de {totalPages} · {total} resultados</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
