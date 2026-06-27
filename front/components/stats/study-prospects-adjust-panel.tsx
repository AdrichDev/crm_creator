'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { generateStudy } from '@/lib/api/market-studies';

// Ajuste de prospección REMOTO (modelo AA): repite la búsqueda en la zona con las
// indicaciones del usuario (generate + refreshProspects). Tematizado al CRM.

export function StudyProspectsAdjustPanel({ studyId, onAdjusted }: { studyId: string; onAdjusted: () => void }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await generateStudy(studyId, { feedback: feedback.trim() || undefined, refreshProspects: true });
      setFeedback('');
      setOpen(false);
      onAdjusted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al ajustar los prospectos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--line,rgba(255,255,255,0.06))] pt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm underline"
          style={{ color: 'var(--acc)' }}
        >
          ¿Quieres ajustar los prospectos?
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-[var(--panel-muted)]">
            Describe cómo quieres ajustar la prospección (p.ej. &quot;céntrate en clínicas dentales&quot; o
            &quot;descarta negocios sin teléfono&quot;). Se repetirá la búsqueda en la zona y se actualizará
            el estudio con tus indicaciones (consume cuota de Google Places).
          </p>
          <textarea
            rows={3}
            maxLength={2000}
            className="opera-control resize-y"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="p.ej. Prioriza restaurantes y clínicas con web pero sin chatbot"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          {loading && (
            <p className="animate-pulse text-xs" style={{ color: 'var(--acc)' }}>
              Actualizando prospección y estudio… Esto puede tardar 30-60 segundos.
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={loading}>{loading ? 'Ajustando…' : 'Ajustar prospectos'}</Button>
            <Button variant="outline" onClick={() => { setOpen(false); setError(null); }} disabled={loading}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
