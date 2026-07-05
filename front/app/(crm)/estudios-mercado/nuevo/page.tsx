'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModuleGuard } from '@/components/layout/module-guard';
import { Button } from '@/components/ui/primitives';
import { ModelEffort } from '@/components/ai/model-effort';
import { createStudy } from '@/lib/api/market-studies';

// Alta de un estudio de mercado (clon de agents-agency). Crea el estudio (POST
// vía proxy del CRM) y navega a su detalle para generar con IA.

const SECTORS = [
  'Restauración', 'Hostelería', 'Retail', 'Comercio', 'Tecnología',
  'Salud', 'Educación', 'Inmobiliaria', 'Legal', 'Consultoría',
  'Construcción', 'Industria', 'Logística', 'Finanzas', 'Otros',
];

export default function NuevoEstudioPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [zone, setZone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [radiusKm, setRadiusKm] = useState('5');
  const [expansionZones, setExpansionZones] = useState('');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [avgBudget, setAvgBudget] = useState('');
  const [model, setModel] = useState('gpt-4.1-nano');
  const [reasoningEffort, setReasoningEffort] = useState('low');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggleSector(sector: string) {
    setSelectedSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector],
    );
    if (errors.sectors) setErrors((e) => ({ ...e, sectors: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'El título es obligatorio';
    if (!zone.trim()) errs.zone = 'La zona es obligatoria';
    if (postalCode && !/^\d+$/.test(postalCode)) errs.postalCode = 'Solo caracteres numéricos';
    const radius = parseInt(radiusKm, 10);
    if (!radiusKm || isNaN(radius) || radius <= 0) errs.radiusKm = 'Radio debe ser un entero positivo';
    if (selectedSectors.length === 0) errs.sectors = 'Selecciona al menos un sector';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const study = await createStudy({
        title: title.trim(),
        model,
        reasoningEffort,
        inputs: {
          zone: zone.trim(),
          postalCode: postalCode.trim() || undefined,
          radiusKm: parseInt(radiusKm, 10),
          expansionZones: expansionZones.split(',').map((s) => s.trim()).filter(Boolean),
          targetSectors: selectedSectors,
          avgBudget: avgBudget ? parseFloat(avgBudget) : undefined,
        },
      });
      router.push(`/estudios-mercado/${study.id}`);
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Error al crear el estudio' });
      setLoading(false);
    }
  }

  return (
    <ModuleGuard module="estudios-mercado">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-wide text-[var(--panel-muted)]">Estudios de mercado</span>
          <h1 className="mt-1 text-2xl font-bold text-[var(--panel-text)]">Nuevo estudio</h1>
          <p className="mt-0.5 text-sm text-[var(--panel-muted)]">
            El estudio se generará con IA usando datos reales del negocio.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="opera-field">
            <label className="opera-label">Título del estudio *</label>
            <input
              className="opera-control"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors((x) => ({ ...x, title: '' })); }}
              placeholder="p.ej. Mercado restauración Madrid 2026"
            />
            {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title}</p>}
          </div>

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

          <ModelEffort variant="opera" model={model} effort={reasoningEffort} onModel={setModel} onEffort={setReasoningEffort} />

          <div>
            <label className="opera-label mb-2 block">Sectores objetivo *</label>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((sector) => (
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

          {errors.submit && (
            <div className="rounded-[10px] border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{errors.submit}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>{loading ? 'Creando…' : 'Crear estudio'}</Button>
            <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
          </div>
        </form>
      </div>
    </ModuleGuard>
  );
}
