'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDialog } from '@/components/ui/dialog-provider';
import { ModuleGuard } from '@/components/layout/module-guard';
import { Button } from '@/components/ui/primitives';
import { StarRating } from '@/components/stats/star-rating';
import { StudyStatusBadge } from '@/components/stats/study-status-badge';
import { StudyIterationPanel } from '@/components/stats/study-iteration-panel';
import { StudySectionEditorRemote } from '@/components/stats/study-section-editor-remote';
import { RecommendedOptionsSection } from '@/components/stats/recommended-options-section';
import { StudyProspectsTable } from '@/components/stats/study-prospects-table';
import { StudyProspectsAdjustPanel } from '@/components/stats/study-prospects-adjust-panel';
import { getStudy, generateStudy, patchStudy, type Study, type Prospect } from '@/lib/api/market-studies';

// Detalle del estudio de mercado (clon de agents-agency, modelo REMOTO vía proxy
// del CRM). Generar/iterar/secciones/prospects. SIN borrado (deshabilitado).

export default function EstudioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const dialog = useDialog();
  const [study, setStudy] = useState<Study | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingScore, setSavingScore] = useState(false);

  const fetchStudy = useCallback(() => {
    getStudy(id)
      .then((data) => { setStudy(data); setLoading(false); })
      .catch((e) => { setError(e?.message ?? 'Error al cargar'); setLoading(false); });
  }, [id]);

  useEffect(() => { fetchStudy(); }, [fetchStudy]);

  async function generate() {
    if (!study) return;
    setGenerating(true);
    setGenWarning(null);
    try {
      const result = await generateStudy(id);
      setStudy(result);
      if (result.placesWarning) setGenWarning(result.placesWarning);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSuccessScoreChange(score: number) {
    if (!study) return;
    setSavingScore(true);
    try {
      const updated = await patchStudy(id, { successScore: score });
      setStudy((prev) => (prev ? { ...prev, successScore: updated.successScore } : prev));
    } catch {
      await dialog.alert('Error al guardar la valoración');
    } finally {
      setSavingScore(false);
    }
  }

  function handleSectionUpdate(key: string, markdown: string) {
    setStudy((prev) => {
      if (!prev) return prev;
      return { ...prev, sections: prev.sections.map((s) => (s.key === key ? { ...s, markdown } : s)) };
    });
  }

  function handleProspectsUpdate(prospects: Prospect[]) {
    setStudy((prev) => (prev ? { ...prev, prospects } : prev));
  }

  return (
    <ModuleGuard module="estudios-mercado">
      {loading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="animate-pulse text-sm text-[var(--panel-muted)]">Cargando estudio…</span>
        </div>
      ) : error || !study ? (
        <div className="mx-auto max-w-2xl">
          <div className="panel text-center">
            <p className="text-sm text-red-400">{error ?? 'Estudio no encontrado'}</p>
            <Button variant="outline" className="mt-3" onClick={() => router.back()}>Volver</Button>
          </div>
        </div>
      ) : (
        <DetailBody
          study={study}
          studyId={id}
          generating={generating}
          genWarning={genWarning}
          savingScore={savingScore}
          onBack={() => router.back()}
          onGenerate={generate}
          onScore={handleSuccessScoreChange}
          onRegenerated={fetchStudy}
          onSectionUpdate={handleSectionUpdate}
          onProspectsUpdate={handleProspectsUpdate}
        />
      )}
    </ModuleGuard>
  );
}

function DetailBody({
  study, studyId, generating, genWarning, savingScore,
  onBack, onGenerate, onScore, onRegenerated, onSectionUpdate, onProspectsUpdate,
}: {
  study: Study;
  studyId: string;
  generating: boolean;
  genWarning: string | null;
  savingScore: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onScore: (s: number) => void;
  onRegenerated: () => void;
  onSectionUpdate: (key: string, markdown: string) => void;
  onProspectsUpdate: (p: Prospect[]) => void;
}) {
  const hasSections = Array.isArray(study.sections) && study.sections.length > 0;
  const hasProspects = Array.isArray(study.prospects) && study.prospects.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-2 flex items-center gap-1 text-sm text-[var(--panel-muted)] hover:text-[var(--panel-text)]">
            ← Estudios
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--panel-text)]">{study.title}</h1>
            <StudyStatusBadge status={study.status} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[var(--panel-muted)]">Valoración del estudio:</span>
            <StarRating value={study.successScore ?? null} editable={!savingScore} onChange={onScore} size="md" />
            {savingScore && <span className="animate-pulse text-xs text-[var(--panel-muted)]">Guardando…</span>}
          </div>
          <p className="mt-1 text-xs text-[var(--panel-muted)]">
            Creado {new Date(study.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {!hasSections ? (
          <Button onClick={onGenerate} disabled={generating}>{generating ? 'Generando…' : 'Generar con IA'}</Button>
        ) : (
          <Button variant="outline" onClick={onGenerate} disabled={generating}>{generating ? 'Regenerando…' : 'Regenerar completo'}</Button>
        )}
      </div>

      {generating && (
        <div className="rounded-[10px] border p-4" style={{ borderColor: 'color-mix(in srgb, var(--acc) 25%, transparent)', background: 'color-mix(in srgb, var(--acc) 6%, transparent)' }}>
          <p className="animate-pulse text-sm" style={{ color: 'var(--acc)' }}>
            Generando estudio con IA… Esto puede tardar 30-60 segundos.
          </p>
        </div>
      )}

      {(genWarning || !study.placesConfigured) && (
        <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-500">
            {genWarning ?? 'Requiere GOOGLE_MAPS_API_KEY para activar prospección'}
          </p>
        </div>
      )}

      {/* Editar inputs + generar/regenerar (siempre editable) */}
      {study.inputs && (
        <StudyIterationPanel
          key={study.updatedAt}
          studyId={studyId}
          inputs={study.inputs}
          placesConfigured={study.placesConfigured}
          hasSections={hasSections}
          onRegenerated={onRegenerated}
        />
      )}

      {/* Resumen de parámetros */}
      {study.inputs && (
        <div className="panel">
          <h2 className="mb-3 text-sm font-semibold text-[var(--panel-text)]">Parámetros del estudio</h2>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div><span className="text-[var(--panel-muted)]">Zona</span><p className="mt-0.5 text-[var(--panel-text)]">{study.inputs.zone}</p></div>
            {study.inputs.postalCode && <div><span className="text-[var(--panel-muted)]">CP</span><p className="mt-0.5 text-[var(--panel-text)]">{study.inputs.postalCode}</p></div>}
            <div><span className="text-[var(--panel-muted)]">Radio</span><p className="mt-0.5 text-[var(--panel-text)]">{study.inputs.radiusKm} km</p></div>
            {study.inputs.avgBudget && <div><span className="text-[var(--panel-muted)]">Ticket medio</span><p className="mt-0.5 text-[var(--panel-text)]">{study.inputs.avgBudget.toLocaleString('es-ES')} €</p></div>}
            {study.inputs.targetSectors?.length > 0 && (
              <div className="col-span-2">
                <span className="text-[var(--panel-muted)]">Sectores</span>
                <p className="mt-0.5 text-[var(--panel-text)]">{study.inputs.targetSectors.join(', ')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Secciones */}
      {hasSections && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--panel-text)]">Contenido del estudio</h2>
          {study.sections.map((section) =>
            section.key === 'recommended_options' ? (
              <RecommendedOptionsSection key={section.key} studyId={studyId} section={section} onUpdate={onSectionUpdate} />
            ) : (
              <StudySectionEditorRemote key={section.key} studyId={studyId} section={section} onUpdate={onSectionUpdate} />
            ),
          )}
        </div>
      )}

      {/* Prospectos */}
      {(hasSections || hasProspects) && (
        <div className="panel">
          <StudyProspectsTable key={`prospects-${study.updatedAt}`} studyId={studyId} prospects={study.prospects} onUpdate={onProspectsUpdate} />
          {hasProspects && <StudyProspectsAdjustPanel studyId={studyId} onAdjusted={onRegenerated} />}
        </div>
      )}

      {/* Vacío */}
      {!hasSections && study.status === 'draft' && (
        <div className="panel text-center">
          <p className="text-sm text-[var(--panel-muted)]">
            El estudio aún no tiene contenido. Revisa los parámetros si lo necesitas y pulsa &quot;Generar con IA&quot;.
          </p>
        </div>
      )}
    </div>
  );
}
