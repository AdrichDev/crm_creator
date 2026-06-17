'use client';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/primitives';
import { StarRating } from '@/components/stats/star-rating';
import { StudySectionEditor } from '@/components/stats/study-section-editor';
import { ProspectsTable } from '@/components/stats/prospects-table';
import { ProspectsAdjustPanel } from '@/components/stats/prospects-adjust-panel';
import { deriveSections } from '@/lib/stats/study-sections';
import type { Estudio, StudySection, Prospect } from '@/lib/stats/study-types';

// Vista de detalle del estudio de mercado interactivo: secciones editables,
// valoración global por estrellas y prospección. Todos los cambios se
// propagan al store mock/localStorage mediante onPatch (un único punto de
// persistencia: useCollection.update en el padre).

export function StudyDetail({
  estudio,
  onPatch,
}: {
  estudio: Estudio;
  onPatch: (patch: Partial<Estudio>) => void;
}) {
  // Las secciones se derivan del contenido si el estudio aún no las tiene.
  const sections = useMemo<StudySection[]>(
    () => (estudio.sections?.length ? estudio.sections : deriveSections(estudio.contenido)),
    [estudio.sections, estudio.contenido],
  );
  const prospects = estudio.prospects ?? [];

  function patchSection(key: string, patch: Partial<StudySection>) {
    onPatch({ sections: sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  }

  function setProspects(next: Prospect[]) {
    onPatch({ prospects: next });
  }

  return (
    <div className="space-y-5">
      {/* Cabecera: modelo + valoración global */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Badge tone="blue">{estudio.modelo}</Badge>
          <span className="text-[var(--panel-muted)]">{estudio.fecha}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--panel-muted)]">
          <span>Valoración del estudio:</span>
          <StarRating
            value={estudio.rating ?? null}
            editable
            onChange={(v) => onPatch({ rating: v })}
            size="md"
          />
        </div>
      </div>

      {/* Secciones editables */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--panel-muted)]">
          Secciones del estudio
        </h2>
        {sections.map((s) => (
          <StudySectionEditor key={s.key} section={s} onChange={(patch) => patchSection(s.key, patch)} />
        ))}
      </section>

      {/* Prospección */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--panel-muted)]">
          Prospección
        </h2>
        <div className="panel">
          <ProspectsTable prospects={prospects} onChange={setProspects} />
          <ProspectsAdjustPanel onAdd={(p) => setProspects([p, ...prospects])} />
        </div>
      </section>
    </div>
  );
}
