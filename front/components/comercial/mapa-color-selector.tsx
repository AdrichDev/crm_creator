'use client';
import type { ColorMode } from '@/lib/comercial/marker-color';
import { ABC_COLORS } from '@/lib/comercial/marker-color';
import type { VisitStateDto } from '@/lib/comercial/types';

// Selector EXCLUSIVO del modo de color del mapa + leyenda dinámica (regla de negocio 9 /
// §16.3): un solo significado de color por vista, leyenda siempre pegada al selector.

interface Props {
  modo: ColorMode;
  onModoChange: (m: ColorMode) => void;
  estados: VisitStateDto[];
}

const ABC_LABELS: Record<'A' | 'B' | 'C', string> = { A: 'Gasto alto', B: 'Gasto medio', C: 'Gasto bajo' };

export function MapaColorSelector({ modo, onModoChange, estados }: Props) {
  const btnCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-[var(--acc)] text-white' : 'text-[var(--panel-muted)] hover:text-white'}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-[var(--panel-muted)]">
        <span>Colorear por:</span>
        <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5">
          <button type="button" aria-pressed={modo === 'estado'} onClick={() => onModoChange('estado')} className={btnCls(modo === 'estado')}>
            Estado de visita
          </button>
          <button type="button" aria-pressed={modo === 'gasto'} onClick={() => onModoChange('gasto')} className={btnCls(modo === 'gasto')}>
            Categoría (gasto)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--panel-muted)]">
        <span>Leyenda ({modo === 'estado' ? 'estado de visita' : 'categoría / gasto'}):</span>
        {modo === 'estado'
          ? estados.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />{s.nombre}
              </span>
            ))
          : (['A', 'B', 'C'] as const).map((cat) => (
              <span key={cat} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ABC_COLORS[cat] }} />
                Cliente {cat} · {ABC_LABELS[cat]}
              </span>
            ))}
      </div>
    </div>
  );
}
