'use client';
import { useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { Button } from '@/components/ui/primitives';
import { StructuredContent } from '@/components/stats/structured-content';
import { patchSection, regenerateSection, type StudySection } from '@/lib/api/market-studies';

// Sección editable de un estudio (modelo AA, persistencia REMOTA vía proxy).
// Lectura con StructuredContent (render markdown ligero del CRM). Permite editar
// el markdown (PATCH) y regenerar la sección con IA (POST). Tematizado al CRM.

export function StudySectionEditorRemote({
  studyId,
  section,
  onUpdate,
  embedded = false,
}: {
  studyId: string;
  section: StudySection;
  onUpdate: (key: string, markdown: string) => void;
  embedded?: boolean;
}) {
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.markdown);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regen, setRegen] = useState(false);
  const [open, setOpen] = useState(embedded);

  async function save() {
    setSaving(true);
    try {
      await patchSection(studyId, section.key, draft);
      onUpdate(section.key, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    const ok = await dialog.confirm({ message: `¿Regenerar la sección "${section.title}"? El contenido actual se reemplazará.`, danger: true });
    if (!ok) return;
    setRegen(true);
    try {
      const result = await regenerateSection(studyId, section.key);
      setDraft(result.section.markdown);
      onUpdate(section.key, result.section.markdown);
      setEditing(false);
    } catch {
      await dialog.alert('Error al regenerar la sección');
    } finally {
      setRegen(false);
    }
  }

  // Embebido (dentro de RecommendedOptionsSection): solo el editor, sin acordeón.
  if (embedded) {
    return (
      <div className="space-y-2 pt-1">
        {!editing ? (
          <Button variant="outline" onClick={() => { setEditing(true); setDraft(section.markdown); }}>
            Editar markdown
          </Button>
        ) : (
          <div className="space-y-2">
            <textarea
              rows={8}
              className="opera-control font-mono"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              <Button variant="outline" onClick={() => { setEditing(false); setDraft(section.markdown); }}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
          {!editing ? (
            <>
              <StructuredContent content={section.markdown} />
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => { setEditing(true); setDraft(section.markdown); }}>Editar</Button>
                <Button variant="ghost" onClick={regenerate} disabled={regen}>
                  {regen ? 'Regenerando…' : 'Regenerar sección'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button variant={preview ? 'ghost' : 'outline'} onClick={() => setPreview(false)}>Editor</Button>
                <Button variant={preview ? 'outline' : 'ghost'} onClick={() => setPreview(true)}>Vista previa</Button>
              </div>
              {!preview ? (
                <textarea
                  rows={10}
                  className="opera-control font-mono"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              ) : (
                <StructuredContent content={draft} />
              )}
              <div className="flex gap-2">
                <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
                <Button variant="outline" onClick={() => { setEditing(false); setDraft(section.markdown); }}>Cancelar</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
