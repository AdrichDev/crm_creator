'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProjects } from '@/lib/tenant-config-context';
import type { ClientLite } from '@/lib/clients/picker';
import { ClientCombobox } from '@/components/config/client-combobox';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
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

const STEPS = ['Tipo de negocio', 'Módulos', 'Marca', 'Base de datos', 'Datos'];

function OnboardingInner() {
  const { createProject, openProject, setConfig, projects } = useProjects();
  const router = useRouter();
  const params = useSearchParams();

  // UC-1: con `?projectId=` el onboarding entra en MODO EDICIÓN (pre-cargado).
  // Sin él → modo alta (comportamiento de siempre, intacto).
  const projectId = params.get('projectId');
  const editing = projects.find((p) => p.id === projectId) ?? null;
  const isEdit = !!editing;

  // En edición se entra directo a "Módulos" (paso 2): no se permite cambiar el
  // cliente/nombre, así que el paso 0 (Tipo de negocio/cliente) queda bloqueado.
  const minStep = isEdit ? 1 : 0;
  const [step, setStep] = useState(minStep);
  const [draft, setDraft] = useState(() =>
    editing ? draftForEdit(editing.config) : configFromVertical('peluqueria', ''));

  // Tenants reales de agents-agency (aa.tenant) para vincular el proyecto.
  // Se leen del back creador_CRM (/tenants, raw cross-schema sobre la Supabase
  // compartida) — sin proxy HTTP a AA. Requiere sesión Supabase.
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [clientsError, setClientsError] = useState('');
  useEffect(() => {
    if (!isApiEnabled()) return; // modo demo sin back: sin tenants
    apiFetch<ClientLite[]>('/tenants')
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClientsError('No se pudieron cargar los clientes (inicia sesión y verifica el backend).'));
  }, []);

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
  function db(patch: Partial<NonNullable<typeof draft.database>>) {
    setDraft({ ...draft, database: { ...draft.database, ...patch } });
  }
  async function finish() {
    const name = draft.business.name.trim() || VERTICAL_MAP[draft.business.vertical].label;
    const cfg = { ...draft, business: { ...draft.business, name },
      branding: { ...draft.branding, logoText: draft.branding.logoText || name.slice(0, 2).toUpperCase() },
      setupComplete: true };
    if (isEdit && editing) {
      // UC-1: persistir SOBRE el proyecto existente, sin crear uno nuevo.
      openProject(editing.id);
      setConfig(cfg);
      router.push('/dashboard');
      return;
    }
    // En modo CRM hay que vincular un cliente (tenant) existente de agents-agency.
    if (isApiEnabled() && !cfg.business.clienteId) {
      alert('Selecciona un cliente (tenant) en el paso "Tipo de negocio". No se puede crear un proyecto sin cliente.');
      setStep(0);
      return;
    }
    try {
      const id = await createProject(cfg);
      openProject(id);
      router.replace('/panel');
    } catch {
      alert('No se pudo crear el proyecto. Verifica que el cliente (tenant) existe y que has iniciado sesión.');
    }
  }

  const activeCount = Object.values(draft.modules).filter(Boolean).length;

  return (
    // Onboarding hereda el tema (claro/oscuro) vía .crm-console: rejilla de fondo
    // en todo el main + tokens --panel-* que voltean con data-theme. Los grises
    // fijos del diseño se remapean a tokens en globals.css (scope .onboarding).
    <div className="crm-console onboarding min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <button onClick={() => router.push('/dashboard')}
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-[var(--acc)]/40 px-3 py-1.5 text-sm font-medium text-[var(--acc)] transition hover:border-[var(--acc)] hover:bg-[color-mix(in_srgb,var(--acc)_8%,transparent)]">
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

            {/* Cliente: combobox que filtra la lista real (agents-agency); al elegir
                uno se fija el nombre del negocio y se rellenan los Datos. */}
            <Card><CardBody>
              <ClientCombobox clients={clients} selectedId={draft.business.clienteId} onPick={pickClient} error={clientsError} />
            </CardBody></Card>
          </div>
        )}

        {step === 1 && (
          <>
            <p className="mb-3 text-sm text-gray-500">{activeCount} módulos activos. Activa o desactiva lo que necesites.{isEdit ? ' Al desactivar un apartado se oculta; sus datos se conservan.' : ''}</p>
            <ModuleToggleGrid modules={draft.modules} onToggle={toggle} terminology={draft.terminology}
              vertical={draft.business.vertical} emojis={draft.moduleEmojis}
              onSetEmoji={(id, emoji) => setDraft((d) => {
                const next = { ...(d.moduleEmojis ?? {}) };
                if (emoji && emoji.trim()) next[id] = emoji.trim(); else delete next[id];
                return { ...d, moduleEmojis: next };
              })} />
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {/* Marca: importar diseño de la landing y, justo debajo, sugerir branding
                con IA (trabajo del operador → no cuenta tokens del cliente). */}
            <BrandingForm primary={draft.branding.primary} secondary={draft.branding.secondary} logoText={draft.branding.logoText} logoImage={draft.branding.logoImage} designSource={draft.branding.designSource} onChange={brand}
              aiSlot={
                <AiBrandingSuggest
                  business={{ name: draft.business.name, vertical: draft.business.vertical }}
                  current={{ primary: draft.branding.primary, secondary: draft.branding.secondary, tokens: draft.branding.tokens }}
                  onApply={brand}
                  landingSource={draft.branding.designSource}
                />
              } />
          </div>
        )}

        {step === 3 && (
          <Card><CardBody className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Base de datos</p>
              <p className="text-xs text-gray-500">Conexión a la BD del proyecto. Todo manual y opcional: si lo dejas vacío, no pasa nada — se puede configurar más adelante.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([['host', 'Host'], ['port', 'Puerto'], ['name', 'Base de datos'], ['user', 'Usuario']] as const).map(([k, label]) => (
                <div key={k}>
                  <label className="text-xs font-medium text-gray-500">{label}</label>
                  <input value={draft.database?.[k] ?? ''} onChange={(e) => db({ [k]: e.target.value } as Partial<NonNullable<typeof draft.database>>)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-500">Contraseña</label>
                <input type="password" value={draft.database?.password ?? ''} onChange={(e) => db({ password: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">URL de conexión (si se prefiere a los campos sueltos)</label>
              <input value={draft.database?.url ?? ''} onChange={(e) => db({ url: e.target.value })}
                placeholder="postgresql://usuario:password@host:puerto/basedatos"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </CardBody></Card>
        )}

        {step === 4 && (
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
          {/* En edición, "Atrás" se desactiva en Módulos: no se puede volver al paso
              del cliente (su nombre no es editable). */}
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(minStep, s - 1))} disabled={step <= minStep}>
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
