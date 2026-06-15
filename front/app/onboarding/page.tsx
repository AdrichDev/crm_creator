'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/lib/tenant-config-context';
import { configFromVertical } from '@/lib/config/tenant-config';
import type { VerticalId } from '@/lib/config/verticals';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import type { ModuleId } from '@/lib/config/modules';
import { MODULE_MAP } from '@/lib/config/modules';
import { VerticalPicker } from '@/components/config/vertical-picker';
import { ModuleToggleGrid } from '@/components/config/module-toggle-grid';
import { BrandingForm } from '@/components/config/branding-form';
import { Button, Card, CardBody } from '@/components/ui/primitives';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = ['Tipo de negocio', 'Módulos', 'Marca', 'Datos'];

export default function Onboarding() {
  const { createProject, openProject } = useProjects();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => configFromVertical('peluqueria', ''));

  function pickVertical(v: VerticalId) {
    const preset = configFromVertical(v, draft.business.name);
    setDraft({ ...preset, business: { ...preset.business, name: draft.business.name } });
  }
  function toggle(id: ModuleId, on: boolean) {
    if (MODULE_MAP[id]?.mandatory) return;
    setDraft({ ...draft, modules: { ...draft.modules, [id]: on } });
  }
  function brand(patch: Partial<{ primary: string; secondary: string; logoText: string; logoImage: string; designSource: string }>) {
    setDraft({ ...draft, branding: { ...draft.branding, ...patch } });
  }
  function finish() {
    const name = draft.business.name.trim() || VERTICAL_MAP[draft.business.vertical].label;
    const cfg = { ...draft, business: { ...draft.business, name },
      branding: { ...draft.branding, logoText: draft.branding.logoText || name.slice(0, 2).toUpperCase() },
      setupComplete: true };
    const id = createProject(cfg);
    openProject(id);
    router.replace('/panel');
  }

  const activeCount = Object.values(draft.modules).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <button onClick={() => router.push('/')}
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" /> Volver a proyectos
        </button>
        <div className="mb-2 text-center">
          <h1 className="font-display text-3xl font-semibold text-gray-900">Configura el negocio</h1>
          <p className="mt-1 text-sm text-gray-500">Elige qué incluye la plataforma. Podrás cambiarlo cuando quieras.</p>
        </div>

        {/* Stepper */}
        <div className="mb-8 mt-6 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn('grid h-8 w-8 place-items-center rounded-full text-xs font-semibold',
                i < step ? 'bg-[var(--brand-primary)] text-white' : i === step ? 'border-2 border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'bg-gray-200 text-gray-500')}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('hidden text-sm sm:block', i === step ? 'font-medium text-gray-900' : 'text-gray-400')}>{s}</span>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <VerticalPicker value={draft.business.vertical} onChange={pickVertical} />
            <Card><CardBody>
              <label className="text-xs font-medium text-gray-500">Nombre del negocio</label>
              <input value={draft.business.name} placeholder="p. ej. Estudio Lúa"
                onChange={(e) => setDraft({ ...draft, business: { ...draft.business, name: e.target.value } })}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
            </CardBody></Card>
          </div>
        )}

        {step === 1 && (
          <>
            <p className="mb-3 text-sm text-gray-500">{activeCount} módulos activos. Activa o desactiva lo que necesites.</p>
            <ModuleToggleGrid modules={draft.modules} onToggle={toggle} terminology={draft.terminology} />
          </>
        )}

        {step === 2 && (
          <BrandingForm primary={draft.branding.primary} secondary={draft.branding.secondary} logoText={draft.branding.logoText} logoImage={draft.branding.logoImage} designSource={draft.branding.designSource} onChange={brand} />
        )}

        {step === 3 && (
          <Card><CardBody className="space-y-4">
            {([['phone', 'Teléfono'], ['email', 'Email'], ['address', 'Dirección']] as const).map(([k, label]) => (
              <div key={k}>
                <label className="text-xs font-medium text-gray-500">{label}</label>
                <input value={(draft.business as Record<string, string>)[k] ?? ''}
                  onChange={(e) => setDraft({ ...draft, business: { ...draft.business, [k]: e.target.value } })}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              </div>
            ))}
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800">Resumen</p>
              <p className="mt-1">Negocio: {draft.business.name || '—'} · {VERTICAL_MAP[draft.business.vertical].label}</p>
              <p>Módulos activos: {activeCount}</p>
            </div>
          </CardBody></Card>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" /> Atrás
          </Button>
          {step < STEPS.length - 1
            ? <Button onClick={() => setStep((s) => s + 1)}>Siguiente <ChevronRight className="h-4 w-4" /></Button>
            : <Button onClick={finish}><Check className="h-4 w-4" /> Crear proyecto</Button>}
        </div>
      </div>
    </div>
  );
}
