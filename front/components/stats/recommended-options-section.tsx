'use client';
import { useState } from 'react';
import { StarRating } from '@/components/stats/star-rating';
import { StructuredContent } from '@/components/stats/structured-content';
import { StudySectionEditorRemote } from '@/components/stats/study-section-editor-remote';
import type { StudySection } from '@/lib/api/market-studies';

// Sección de opciones recomendadas (modelo AA). Intenta parsear un array JSON de
// opciones {title, description, successScore, rationale} y renderiza tarjetas con
// valoración. Si no hay JSON, cae al render markdown. Tematizado al CRM.

interface RecommendedOption {
  title: string;
  description: string;
  successScore: number;
  rationale: string;
}

function parseRecommendedOptions(markdown: string): RecommendedOption[] | null {
  const fenceMatch = markdown.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  const bareMatch = markdown.match(/(\[[\s\S]*"successScore"[\s\S]*?\])/);
  const raw = fenceMatch?.[1] ?? bareMatch?.[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (o: unknown): o is RecommendedOption =>
        typeof (o as RecommendedOption)?.title === 'string' &&
        typeof (o as RecommendedOption)?.successScore === 'number',
    );
  } catch {
    return null;
  }
}

export function RecommendedOptionsSection({
  studyId,
  section,
  onUpdate,
}: {
  studyId: string;
  section: StudySection;
  onUpdate: (key: string, markdown: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = parseRecommendedOptions(section.markdown);

  return (
    <div className="panel">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-base font-semibold text-[var(--panel-text)]">{section.title}</span>
        <span className="text-sm text-[var(--panel-muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-[var(--line,rgba(255,255,255,0.06))] pt-3">
          {options && options.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {options.map((opt, i) => (
                <div key={i} className="rounded-[10px] border border-[var(--line,rgba(255,255,255,0.06))] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--panel-text)]">{opt.title}</span>
                    <StarRating value={opt.successScore} size="sm" />
                  </div>
                  <p className="text-xs text-[var(--panel-muted)]">{opt.description}</p>
                  {opt.rationale && (
                    <p className="text-xs italic text-[var(--panel-muted)]">Justificación: {opt.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <StructuredContent content={section.markdown} />
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-[var(--panel-muted)] hover:text-[var(--panel-text)]">
              Editar contenido raw
            </summary>
            <StudySectionEditorRemote studyId={studyId} section={section} onUpdate={onUpdate} embedded />
          </details>
        </div>
      )}
    </div>
  );
}
