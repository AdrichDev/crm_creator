'use client';
import type { ColorMode } from '@/lib/comercial/marker-color';
import { ABC_COLORS } from '@/lib/comercial/marker-color';
import { CONTACT_COLOR } from '@/lib/comercial/map-point';
import type { VisitStateDto } from '@/lib/comercial/types';

// Selector EXCLUSIVO del modo de color del mapa + leyenda dinámica (regla de negocio 9 /
// §16.3): un solo significado de color por vista, leyenda siempre pegada al selector.
// crm-operaos 9.3: la leyenda es clicable y actúa de filtro toggle (single-select por
// dimensión, alineado al backend que acepta un solo estadoVisitaId/categoriaAbc). El
// botón de modo se pinta en verde cuando hay un filtro activo en esa dimensión.

interface Props {
  modo: ColorMode;
  onModoChange: (m: ColorMode) => void;
  estados: VisitStateDto[];
  /** Filtro activo por estado de visita ('' = sin filtro). */
  filtroEstadoId: string;
  /** Filtro activo por categoría ABC ('' = sin filtro). */
  filtroCategoria: string;
  onFiltroEstadoChange: (id: string) => void;
  onFiltroCategoriaChange: (cat: string) => void;
}

const ABC_LABELS: Record<'A' | 'B' | 'C', string> = { A: 'Gasto alto', B: 'Gasto medio', C: 'Gasto bajo' };

export function MapaColorSelector({
  modo, onModoChange, estados,
  filtroEstadoId, filtroCategoria, onFiltroEstadoChange, onFiltroCategoriaChange,
}: Props) {
  // Verde (emerald, coherente con éxito en el resto de la UI) cuando la dimensión tiene
  // un filtro aplicado; si no, estilo normal activo/inactivo del selector.
  const btnCls = (active: boolean, hasFilter: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition ${
      hasFilter
        ? 'bg-emerald-600 text-white'
        : active ? 'bg-[var(--acc)] text-white' : 'text-[var(--panel-muted)] hover:text-[var(--hover-text)]'
    }`;

  // Item de leyenda clicable: el activo se marca con anillo + fondo; el resto atenuado
  // levemente al hover para invitar al click.
  const legendCls = (selected: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition ${
      selected
        ? 'border-emerald-500/70 bg-emerald-500/15 text-white ring-1 ring-emerald-500/60'
        : 'border-transparent hover:border-white/20 hover:text-[var(--hover-text)]'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-[var(--panel-muted)]">
        <span>Colorear por:</span>
        <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5">
          <button type="button" aria-pressed={modo === 'estado'} onClick={() => onModoChange('estado')}
            className={btnCls(modo === 'estado', filtroEstadoId !== '')}>
            Estado de visita
          </button>
          <button type="button" aria-pressed={modo === 'gasto'} onClick={() => onModoChange('gasto')}
            className={btnCls(modo === 'gasto', filtroCategoria !== '')}>
            Categoría (gasto)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--panel-muted)]">
        <span>Leyenda ({modo === 'estado' ? 'estado de visita' : 'categoría / gasto'}) — click para filtrar:</span>
        {modo === 'estado'
          ? estados.map((s) => {
              const selected = filtroEstadoId === s.id;
              return (
                <button key={s.id} type="button" aria-pressed={selected}
                  onClick={() => onFiltroEstadoChange(selected ? '' : s.id)}
                  className={legendCls(selected)}>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />{s.nombre}
                </button>
              );
            })
          : (['A', 'B', 'C'] as const).map((cat) => {
              const selected = filtroCategoria === cat;
              return (
                <button key={cat} type="button" aria-pressed={selected}
                  onClick={() => onFiltroCategoriaChange(selected ? '' : cat)}
                  className={legendCls(selected)}>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ABC_COLORS[cat] }} />
                  Cliente {cat} · {ABC_LABELS[cat]}
                </button>
              );
            })}
        {/* Entrada fija de leyenda para la capa de contactos (leads/prospectos): rombo violeta,
            neutro, no filtrable (los contactos no tienen estado de visita ni categoría ABC). */}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1"
          title="Leads y prospectos de la agenda de Contactos">
          <span className="h-3 w-3 rotate-45" style={{ backgroundColor: CONTACT_COLOR }} />
          Contacto (lead/prospecto)
        </span>
      </div>
    </div>
  );
}
