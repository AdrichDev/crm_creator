'use client';
import { Badge } from '@/components/ui/primitives';
import type { AbcCategory } from '@/lib/comercial/types';

// Badge de CATEGORÍA COMERCIAL ABC. Independiente del estado de visita (regla de negocio 4).
// A = alta prioridad, B = media, C = baja. Nunca fija el color del marcador.
export function AbcBadge({ categoria }: { categoria: AbcCategory | null }) {
  if (!categoria) return <span className="text-xs text-[var(--panel-muted)]">—</span>;
  const tone = categoria === 'A' ? 'brand' : categoria === 'B' ? 'blue' : 'gray';
  return <Badge tone={tone}>Cliente {categoria}</Badge>;
}
