'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { patchStudy, generateStudy, type MarketStudyInputs } from '@/lib/api/market-studies';

// Panel de edición + (re)generación de un estudio (modelo AA, REMOTO). Persiste
// los inputs (PATCH) y dispara la generación (POST /generate), con opción de
// "Generar prompt (IA)". Tematizado al CRM (clases opera-*).

const SECTORS = [
  'Restauración', 'Hostelería', 'Retail', 'Comercio', 'Tecnología',
  'Salud', 'Educación', 'Inmobiliaria', 'Legal', 'Consultoría',
  'Construcción', 'Industria', 'Logística', 'Finanzas', 'Otros',
];

interface Props {
  studyId: string;
  inputs: MarketStudyInputs;
  placesConfigured?: boolean;
  hasSections?: boolean;
  onRegenerated: () => void;
}

export function StudyIterationPanel({ studyId, inputs, placesConfigured, hasSections = true, onRegenerated }: Props) {
  const [open, setOpen] = useState(!hasSections);

  const [zone, setZone] = useState(inputs.zone ?? '');
  const [postalCode, setPostalCode] = useState(inputs.postalCode ?? '');
  const [radiusKm, setRadiusKm] = useState(String(inputs.radiusKm ?? 5));
  const [expansionZones, setExpansionZones] = useState((inputs.expansionZones ?? []).join(', '));
  const [selectedSectors, setSelectedSectors] = useState<string[]>(inputs.targetSectors ?? []);
  const [avgBudget, setAvgBudget] = useState(inputs.avgBudget ? String(inputs.avgBudget) : '');
  const [feedback, setFeedback] = useState('');
  const [refreshProspects, setRefreshProspects] = useState(false);

  const [loading, setLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const allSectors = Array.from(new Set([...SECTORS, ...selectedSectors]));

  function toggleSector(sector: string) {
    setSelectedSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector],
    );
    if (errors.sectors) setErrors((e) => ({ ...e, sectors: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!zone.trim()) errs.zone = 'La zona es obligatoria';
    if (postalCode && !/^\d+$/.test(postalCode)) errs.postalCode = 'Solo caracteres numéricos';
    const radius = parseInt(radiusKm, 10);
    if (!radiusKm || isNaN(radius) || radius <= 0) errs.radiusKm = 'Radio debe ser un entero positivo';
    if (selectedSectors.length === 0) errs.sectors = 'Selecciona al menos un sector';
    if (feedback.length > 2000) errs.feedback = 'Máximo 2000 caracteres';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function buildInputs(): MarketStudyInputs {
    return {
      zone: zone.trim(),
      postalCode: postalCode.trim() || undefined,
      radiusKm: parseInt(radiusKm, 10),
      expansionZones: expansionZones.split(',').map((s) => s.trim()).filter(Boolean),
      targetSectors: selectedSectors,
      avgBudget: avgBudget ? parseFloat(avgBudget) : undefined,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (hasSections && !confirm('Las secciones del estudio se reescribirán. Tus ediciones manuales se incorporan como contexto, pero el contenido puede cambiar. ¿Regenerar el estudio?')) {
      return;
    }

    setLoading(true);
    setErrors({});
    let inputsSaved = false;
    try {
      await patchStudy(studyId, { inputs: buildInputs() });
      inputsSaved = true;
      await generateStudy(studyId, { feedback: feedback.trim() || undefined, refreshProspects });
      setFeedback('');
      onRegenerated();
    } catch (err) {
      const base = err instanceof Error ? err.message : 'Error al generar el estudio';
      setErrors({
        submit: inputsSaved
          ? `Los parámetros se guardaron, pero la generación falló: ${base}. El contenido actual está desactualizado — vuelve a pulsar "${hasSections ? 'Regenerar estudio' : 'Generar con IA'}".`
          : base,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePrompt() {
    if (!validate()) return;
    if (!confirm('Se generará el prompt óptimo con IA (según tu selección y nuestro core de negocio) y se regenerará el estudio al instante. ¿Continuar?')) return;

    setPromptLoading(true);
    setErrors({});
    let inputsSaved = false;
    try {
      await patchStudy(studyId, { inputs: buildInputs() });
      inputsSaved = true;
      const result = await generateStudy(studyId, {
        feedback: feedback.trim() || undefined,
        refreshProspects,
        generatePrompt: true,
      });
      if (result.generatedPrompt) setFeedback(result.generatedPrompt);
      onRegenerated();
    } catch (err) {
      const base = err instanceof Error ? err.message : 'Error al generar el prompt';
      setErrors({
        submit: inputsSaved ? `Los parámetros se guardaron, pero la generación falló: ${base}.` : base,
      });
    } finally {
      setPromptLoading(false);
    }
  }

  return (
    <div className="panel">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-semibold text-[var(--panel-text)]">
          {hasSections ? 'Editar y regenerar' : 'Editar parámetros y generar'}
        </span>
        <span className="text-sm text-[var(--panel-muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-4 border-t border-[var(--line,rgba(255,255,255,0.06))] pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="opera-field">
              <label className="opera-label">Zona / Ciudad *</label>
              <input
                className="opera-control"
                value={zone}
                onChange={(e) => { setZone(e.target.value); if (errors.zone) setErrors((x) => ({ ...x, zone: '' })); }}
                placeholder="p.ej. Madrid, Salamanca"
              />
              {errors.zone && <p className="mt-1 text-xs text-red-400">{errors.zone}</p>}
            </div>
            <div className="opera-field">
              <label className="opera-label">Código postal</label>
              <input
                className="opera-control"
                value={postalCode}
                onChange={(e) => { setPostalCode(e.target.value); if (errors.postalCode) setErrors((x) => ({ ...x, postalCode: '' })); }}
                placeholder="28001"
                maxLength={10}
              />
              {errors.postalCode && <p className="mt-1 text-xs text-red-400">{errors.postalCode}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="opera-field">
              <label className="opera-label">Radio de búsqueda (km) *</label>
              <input
                type="number"
                min={1}
                className="opera-control"
                value={radiusKm}
                onChange={(e) => { setRadiusKm(e.target.value); if (errors.radiusKm) setErrors((x) => ({ ...x, radiusKm: '' })); }}
              />
              {errors.radiusKm && <p className="mt-1 text-xs text-red-400">{errors.radiusKm}</p>}
            </div>
            <div className="opera-field">
              <label className="opera-label">Ticket medio (€)</label>
              <input
                type="number"
                min={1}
                className="opera-control"
                value={avgBudget}
                onChange={(e) => setAvgBudget(e.target.value)}
                placeholder="1200"
              />
            </div>
          </div>

          <div className="opera-field">
            <label className="opera-label">Zonas de expansión (separadas por coma)</label>
            <input
              className="opera-control"
              value={expansionZones}
              onChange={(e) => setExpansionZones(e.target.value)}
              placeholder="Barcelona, Valencia, Sevilla"
            />
          </div>

          <div>
            <label className="opera-label mb-2 block">Sectores objetivo *</label>
            <div className="flex flex-wrap gap-2">
              {allSectors.map((sector) => (
                <button
                  key={sector}
                  type="button"
                  onClick={() => toggleSector(sector)}
                  className="rounded-full border px-3 py-1 text-sm transition-colors"
                  style={selectedSectors.includes(sector)
                    ? { background: 'color-mix(in srgb, var(--acc) 16%, transparent)', color: 'var(--acc)', border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)' }
                    : { color: 'var(--panel-muted)', border: '1px solid var(--line, rgba(255,255,255,0.1))' }}
                >
                  {sector}
                </button>
              ))}
            </div>
            {errors.sectors && <p className="mt-2 text-xs text-red-400">{errors.sectors}</p>}
          </div>

          <div className="opera-field">
            <label className="opera-label">Instrucciones para esta iteración (opcional)</label>
            <textarea
              rows={3}
              maxLength={2000}
              className="opera-control resize-y"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="p.ej. Profundiza en el sector salud y ajusta el pricing al nuevo ticket medio"
            />
            {errors.feedback && <p className="mt-1 text-xs text-red-400">{errors.feedback}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGeneratePrompt}
                disabled={loading || promptLoading}
                className="rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                style={{ color: 'var(--acc)', background: 'color-mix(in srgb, var(--acc) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)' }}
                title="La IA crea el prompt óptimo según tu selección y nuestro core de negocio, y regenera el estudio al instante"
              >
                {promptLoading ? 'Generando prompt…' : '✦ Generar prompt (IA)'}
              </button>
              <span className="text-[11px] text-[var(--panel-muted)]">
                Crea el prompt óptimo según tu selección y nuestro core, y regenera al instante.
              </span>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={refreshProspects}
              onChange={(e) => setRefreshProspects(e.target.checked)}
              className="mt-0.5"
              style={{ accentColor: 'var(--acc)' }}
            />
            <span className="text-sm text-[var(--panel-text)]">
              Actualizar prospección (consume cuota de Google Places)
              {!placesConfigured && (
                <span className="mt-0.5 block text-xs text-amber-500">
                  Requiere GOOGLE_MAPS_API_KEY configurada en el backend
                </span>
              )}
            </span>
          </label>

          {errors.submit && (
            <div className="rounded-[10px] border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{errors.submit}</p>
            </div>
          )}

          {(loading || promptLoading) && (
            <p className="animate-pulse text-sm" style={{ color: 'var(--acc)' }}>
              {promptLoading
                ? 'Generando prompt óptimo y regenerando estudio con IA…'
                : `${hasSections ? 'Regenerando' : 'Generando'} estudio con IA…`}{' '}
              Esto puede tardar 30-60 segundos.
            </p>
          )}

          <Button type="submit" disabled={loading || promptLoading}>
            {loading
              ? (hasSections ? 'Regenerando…' : 'Generando…')
              : (hasSections ? 'Regenerar estudio' : 'Generar con IA')}
          </Button>
        </form>
      )}
    </div>
  );
}
