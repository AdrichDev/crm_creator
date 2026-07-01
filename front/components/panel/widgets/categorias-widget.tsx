'use client';
import Link from 'next/link';
import { isApiEnabled } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { DEPORTE_LABELS, type DeporteType } from '@/lib/config/sport-positions';
import { WidgetShell } from './widget-shell';

interface TeamRow {
  id: string;
  nombre: string;
  deporte: DeporteType;
  totalMiembros: number;
}

/** Equipos/categorías del club (módulo `categorias`, solo centro-deportivo). */
export function CategoriasWidget() {
  const apiEnabled = isApiEnabled();
  const paged = usePaginatedApi<TeamRow>('/categories', 6, apiEnabled);

  return (
    <WidgetShell icon="Trophy" label="Categorías">
      {!apiEnabled ? (
        <p className="text-xs text-[var(--panel-muted)]">Módulo disponible solo en modo CRM.</p>
      ) : paged.items.length === 0 ? (
        <p className="text-xs text-[var(--panel-muted)]">Sin equipos todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {paged.items.map((t) => (
            <li key={t.id}>
              <Link href={`/categorias/${t.id}`} className="flex items-center justify-between gap-2 text-xs hover:underline">
                <span className="truncate text-[var(--panel-text)]">{t.nombre}</span>
                <span className="shrink-0 text-[var(--panel-muted)]">{DEPORTE_LABELS[t.deporte]} · {t.totalMiembros}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
