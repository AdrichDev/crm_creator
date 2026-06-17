'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProjects } from '@/lib/tenant-config-context';
import { prepareClientOptions, type ClientLite } from '@/lib/clients/picker';
import { configFromVertical } from '@/lib/config/tenant-config';
import { draftForEdit } from '@/lib/onboarding/edit-mode';
import type { VerticalId } from '@/lib/config/verticals';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import type { ModuleId } from '@/lib/config/modules';
import { MODULE_MAP } from '@/lib/config/modules';
import type { DesignTokens } from '@/lib/config/tenant-config';
import { VerticalPicker } from '@/components/config/vertical-picker';
import { ModuleToggleGrid } from '@/components/config/module-toggle-grid';
import { BrandingForm } from '@/components/config/branding-form';
import { AiBrandingSuggest } from '@/components/config/ai-branding-suggest';
import { Button, Card, CardBody } from '@/components/ui/primitives';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = ['Tipo de negocio', 'Módulos', 'Marca', 'Datos'];

function OnboardingInner() {
  const { createProject, openProject, setConfig, projects } = useProjects();
  const router = useRouter();
  const params = useSearchParams();

  // UC-1: con `?projectId=` el onboarding entra en MODO EDICIÓN (pre-cargado).
  // Sin él → modo alta (comportamiento de siempre, intacto).
  const projectId = params.get('projectId');
  const editing = projects.find((p) => p.id === projectId) ?? null;
  const isEdit = !!editing;

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() =>
    editing ? draftForEdit(editing.config) : configFromVertical('peluqueria', ''));

  // Clientes reales (de agents-agency) para vincular el proyecto.
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientsError, setClientsError] = useState('');
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClientsError('No se pudieron cargar los clientes (¿backend de agents-agency arrancado?).'));
  }, []);
  const clientOptions = useMemo(() => prepareClientOptions(clients, clientSearch), [clients, clientSearch]);

  function pickClient(c: ClientLite) {
    setDraft((d) => ({
      ...d,
      business: {
        ...d.business,
        clienteId: c.id,
        name: c.nombre || d.business.name,
        email: c.email ?? d.business.email,
        phone: c.telefono ?? d.business.phone,
        address: c.direccion ?? d.business.address,
      },
    }));
  }

  function pickVertical(v: VerticalId) {
    if (v === draft.business.vertical) return;
    // En edición, cambiar de vertical MACHACA módulos/marca/terminología con el preset.
    // Avisar y confirmar para no perder la configuración existente sin querer.
    if (isEdit && !confirm('Cambiar de sector reemplaza módulos, marca y terminología por el preset del nuevo sector. ¿Continuar?')) return;
    const preset = configFromVertical(v, draft.business.name);
    setDraft({ ...preset, business: { ...preset.business, name: draft.business.name } });
  }
  function toggle(id: ModuleId, on: boolean) {
    if (MODULE_MAP[id]?.mandatory) return;
    setDraft({ ...draft, modules: { ...draft.modules, [id]: on } });
  }
  function brand(patch: Partial<{ primary: string; secondary: string; logoText: string; logoImage: string; designSource: string; tokens: DesignTokens }>) {
    setDraft({ ...draft, branding: { ...draft.branding, ...patch } });
  }
  function finish() {
    const name = draft.business.name.trim() || VERTICAL_MAP[draft.business.vertical].label;
    const cfg = { ...draft, business: { ...draft.business, name },
      branding: { ...draft.branding, logoText: draft.branding.logoText || name.slice(0, 2).toUpperCase() },
      setupComplete: true };
    if (isEdit && editing) {
      // UC-1: persistir SOBRE el proyecto existente, sin crear uno nuevo.
      // setConfig reemplaza la config del proyecto activo en localStorage; quitar un
      // módulo solo lo OCULTA (su flag a false), no borra datos del proyecto.
      openProject(editing.id);
      setConfig(cfg);
      router.push('/');
      return;
    }
    const id = createProject(cfg);
    openProject(id);
    router.replace('/panel');
  }

  const activeCount = Object.values(draft.modules).filter(Boolean).length;

  return (
    // Onboarding hereda el tema (claro/oscuro) vía .crm-console: rejilla de fondo
    // en todo el main + tokens --panel-* que voltean con data-theme. Los grises
    // fijos del diseño se remapean a tokens en globals.css (scope .onboarding).
    <div className="crm-console onboarding min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <button onClick={() => router.push('/')}
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" /> Volver a proyectos
        </button>
        <div className="mb-2 text-center">
          <h1 className="font-display text-3xl font-semibold text-gray-900">{isEdit ? 'Editar el negocio' : 'Configura el negocio'}</h1>
          <p className="mt-1 text-sm text-gray-500">{isEdit ? 'Ajusta apartados, marca y datos. Los cambios se guardan sobre este proyecto.' : 'Elige qué incluye la plataforma. Podrás cambiarlo cuando quieras.'}</p>
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

            {/* Vincular cliente real (de agents-agency): alfabético, máx. 20 + scroll, filtro */}
            <Card><CardBody>
              <label className="text-xs font-medium text-gray-500">Cliente vinculado</label>
              <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Filtrar clientes por nombre…"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              {clientsError && <p className="mt-2 text-xs text-amber-600">{clientsError}</p>}
              <div className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
                {clientOptions.ordenados.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400">Sin clientes.</p>
                ) : clientOptions.ordenados.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickClient(c)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-gray-50 ${
                      draft.business.clienteId === c.id ? 'bg-[var(--brand-primary)]/10 font-medium text-gray-900' : 'text-gray-700'
                    }`}>
                    <span>{c.nombre}</span>
                    {draft.business.clienteId === c.id && <span className="text-xs text-[var(--brand-primary)]">vinculado ✓</span>}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{clientOptions.total} cliente(s){clientOptions.hayScroll ? ' · desplázate para ver más' : ''}. Al elegir uno se rellenan los Datos.</p>
            </CardBody></Card>
          </div>
        )}

        {step === 1 && (
          <>
            <p className="mb-3 text-sm text-gray-500">{activeCount} módulos activos. Activa o desactiva lo que necesites.{isEdit ? ' Al desactivar un apartado se oculta; sus datos se conservan.' : ''}</p>
            <ModuleToggleGrid modules={draft.modules} onToggle={toggle} terminology={draft.terminology} />
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {/* UC-3 · Sugerir branding con IA (desde el contexto del negocio, reversible). */}
            <Card><CardBody>
              <AiBrandingSuggest
                business={{ name: draft.business.name, vertical: draft.business.vertical }}
                clientId={draft.business.clienteId ?? null}
                current={{ primary: draft.branding.primary, secondary: draft.branding.secondary, tokens: draft.branding.tokens }}
                onApply={brand}
              />
            </CardBody></Card>
            <BrandingForm primary={draft.branding.primary} secondary={draft.branding.secondary} logoText={draft.branding.logoText} logoImage={draft.branding.logoImage} designSource={draft.branding.designSource} onChange={brand} />
          </div>
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
            : <Button onClick={finish}><Check className="h-4 w-4" /> {isEdit ? 'Guardar cambios' : 'Crear proyecto'}</Button>}
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  // useSearchParams exige un límite <Suspense> para no romper el build estático.
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-surface text-gray-400">Cargando…</div>}>
      <OnboardingInner />
    </Suspense>
  );
}
