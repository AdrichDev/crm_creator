'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { StructuredContent } from '@/components/stats/structured-content';
import { StarRating } from '@/components/stats/star-rating';
import type { StudySection } from '@/lib/stats/study-types';

// Sección editable de un estudio. En modo lectura muestra el contenido con
// StructuredContent y la valoración por estrellas. En modo edición permite
// reescribir el markdown. La persistencia la hace el componente padre vía
// onChange (store mock/localStorage), no este componente.

export function StudySectionEditor({
  section,
  onChange,
}: {
  section: StudySection;
  onChange: (patch: Partial<StudySection>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.markdown);
  const [preview, setPreview] = useState(false);

  function save() {
    onChange({ markdown: draft });
    setEditing(false);
  }

  return (
    <div className="panel">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-base font-semibold text-[var(--panel-text)]">{section.title}</span>
        <span className="flex items-center gap-3">
          <StarRating value={section.rating ?? null} size="sm" />
          <span className="text-sm text-[var(--panel-muted)]">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-[var(--line,rgba(255,255,255,0.06))] pt-3">
          {/* Valoración editable de la sección */}
          <div className="flex items-center gap-2 text-sm text-[var(--panel-muted)]">
            <span>Tu valoración:</span>
            <StarRating
              value={section.rating ?? null}
              editable
              onChange={(v) => onChange({ rating: v })}
              size="md"
            />
          </div>

          {!editing ? (
            <>
              <StructuredContent content={section.markdown} />
              <Button variant="outline" onClick={() => { setEditing(true); setDraft(section.markdown); }}>
                Editar
              </Button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button variant={preview ? 'ghost' : 'outline'} onClick={() => setPreview(false)}>Editor</Button>
                <Button variant={preview ? 'outline' : 'ghost'} onClick={() => setPreview(true)}>Vista previa</Button>
              </div>
              {!preview ? (
                <textarea
                  className="opera-control font-mono"
                  rows={10}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              ) : (
                <StructuredContent content={draft} />
              )}
              <div className="flex gap-2">
                <Button onClick={save}>Guardar</Button>
                <Button variant="outline" onClick={() => { setEditing(false); setDraft(section.markdown); }}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
