'use client';
import type { EstadoVisitaRef } from '@/lib/comercial/types';

// Badge del ESTADO DE VISITA. Usa el color propio del estado (configurable), NO un tono fijo.
// Es el concepto que fija el color del marcador en el mapa. Separado de la categoría ABC.
export function EstadoVisitaBadge({ estado }: { estado: EstadoVisitaRef | null }) {
  if (!estado) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-xs text-[var(--panel-muted)]">
        <span className="h-2 w-2 rounded-full bg-[var(--panel-muted)]" />
        Sin estado
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${estado.color}22`, color: estado.color, border: `1px solid ${estado.color}55` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: estado.color }} />
      {estado.nombre}
    </span>
  );
}
