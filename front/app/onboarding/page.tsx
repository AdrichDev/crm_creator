'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
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
import { MODULE_MAP, MODULES } from '@/lib/config/modules';
import type { DesignTokens, BusinessViews } from '@/lib/config/tenant-config';
import { DEFAULT_VIEWS } from '@/lib/config/tenant-config';
import { VerticalPicker } from '@/components/config/vertical-picker';
import { HorarioNegocioForm } from '@/components/config/horario-negocio-form';
import { scheduleToTramos } from '@/lib/config/schedule';
import type { TenantConfig } from '@/lib/config/tenant-config';
import { ModuleToggleGrid } from '@/components/config/module-toggle-grid';
import { BrandingForm } from '@/components/config/branding-form';
import { AiBrandingSuggest } from '@/components/config/ai-branding-suggest';
import { Button, Card, CardBody } from '@/components/ui/primitives';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = ['Tipo de negocio', 'Módulos', 'Marca', 'Base de datos', 'Datos'];

function OnboardingInner() {
  const { createProject, updateProject, openProject, projects } = useProjects();
  const router = useRouter();
  const params = useSearchParams();
  const dialog = useDialog();

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
  // Visual del picker: null = ninguna card seleccionada. Separado de draft.business.vertical
  // (que cae a 'custom' cuando el usuario deselecciona) para poder mostrar estado vacío.
  const [pickedVertical, setPickedVertical] = useState<VerticalId | null>(
    editing ? (editing.config.business.vertical ?? null) : 'peluqueria',
  );

  // Tenants reales de agents-agency (aa.tenant) para vincular el proyecto.
  // Se leen del back creador_CRM (/tenants, raw cross-schema sobre la Supabase
  // compartida) — sin proxy HTTP a AA. Requiere sesión Supabase.
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [clientsError, setClientsError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
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

  async function pickVertical(v: VerticalId): Promise<void> {
    // Datos de contacto del negocio a preservar siempre al cambiar vertical.
    const { clienteId, name, email, phone, address } = draft.business;
    // Toggle: clicar la card ya seleccionada → deseleccionar (vuelve a 'custom' visualmente limpio).
    if (v === pickedVertical) {
      setPickedVertical(null);
      const preset = configFromVertical('custom', name);
      setDraft({ ...preset, business: { ...preset.business, name, clienteId, email, phone, address } });
      return;
    }
    // En edición, cambiar de vertical MACHACA módulos/marca/terminología con el preset.
    if (isEdit) {
      const ok = await dialog.confirm({ message: 'Cambiar de sector reemplaza módulos, marca y terminología por el preset del nuevo sector. ¿Continuar?' });
      if (!ok) return;
    }
    setPickedVertical(v);
    const preset = configFromVertical(v, name);
    // Conservar todos los datos de contacto del cliente al cambiar de vertical.
    setDraft({ ...preset, business: { ...preset.business, name, clienteId, email, phone, address } });
  }
  function toggle(id: ModuleId, on: boolean) {
    if (MODULE_MAP[id]?.mandatory) return;
    setDraft({ ...draft, modules: { ...draft.modules, [id]: on } });
  }
  function changeViews(v: BusinessViews) {
    setDraft((d) => {
      const modules = { ...d.modules };
      // Al apagar "Trabajador", los módulos de personas se auto-desactivan.
      if (!v.worker) {
        for (const m of MODULES) if (m.requiresWorkerView) modules[m.id] = false;
      }
      return { ...d, modules, views: v };
    });
  }
  function brand(patch: Partial<{ primary: string; secondary: string; logoText: string; logoImage: string; designSource: string; tokens: DesignTokens }>) {
    setDraft({ ...draft, branding: { ...draft.branding, ...patch } });
  }
  function db(patch: Partial<NonNullable<typeof draft.database>>) {
    setDraft({ ...draft, database: { ...draft.database, ...patch } });
  }
  // Persiste el horario de apertura en OpeningHour (PUT /config/horario) para que
  // la disponibilidad del calendario (chips de hora) refleje lo definido aquí.
  // Solo en modo API y solo si el usuario definió horario (cfg.horario): si nunca
  // se tocó, NO se hace PUT (evita borrar horas configuradas por otra vía). Debe
  // llamarse DESPUÉS de openProject(id): fija el x-business-id del negocio correcto.
  // En modo generador/mock no hay negocio real → el horario queda solo en la config.
  async function syncHorarioApertura(cfg: TenantConfig): Promise<void> {
    if (!isApiEnabled() || !cfg.horario) return;
    await apiFetch('/config/horario', {
      method: 'PUT',
      body: JSON.stringify({ tramos: scheduleToTramos(cfg.horario) }),
    });
  }

  // Best-effort con error visible: el proyecto YA quedó guardado; si el horario
  // falla se avisa (dialog) y se navega igual — reintentar el guardado del
  // onboarding volvería a intentar el PUT (idempotente, reemplazo completo).
  async function syncHorarioConAviso(cfg: TenantConfig): Promise<void> {
    try {
      await syncHorarioApertura(cfg);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      await dialog.alert(
        `El proyecto se guardó, pero el horario de apertura no se pudo aplicar${msg ? ` (${msg})` : ''}. ` +
        'Edita el proyecto y vuelve a guardar para reintentarlo.',
      );
    }
  }

  async function finish() {
    const name = draft.business.name.trim() || VERTICAL_MAP[draft.business.vertical].label;
    const cfg = { ...draft, business: { ...draft.business, name },
      branding: { ...draft.branding, logoText: draft.branding.logoText || name.slice(0, 2).toUpperCase() },
      setupComplete: true };
    if (isEdit && editing) {
      // UC-1: persistir SOBRE el proyecto existente (PATCH /projects/:id), sin crear
      // uno nuevo. Se ESPERA el guardado con el id explícito del proyecto editado; si
      // falla, se muestra el error y NO se navega (no declarar "guardado" en falso).
      setErrorMsg('');
      try {
        await updateProject(editing.id, cfg);
        // Deja el proyecto editado como activo (como antes de este fix): evita que
        // /dashboard u otras vistas queden apuntando al proyecto activo anterior.
        openProject(editing.id);
        // Aplica el horario a OpeningHour (requiere el x-business-id ya fijado).
        await syncHorarioConAviso(cfg);
        router.push('/dashboard');
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? '';
        setErrorMsg(msg || 'No se pudieron guardar los cambios. Verifica que tienes sesión activa y el backend responde.');
      }
      return;
    }
    // En modo CRM hay que vincular un cliente (tenant) existente de agents-agency.
    if (isApiEnabled() && !cfg.business.clienteId) {
      setErrorMsg('Selecciona un cliente en el paso "Tipo de negocio" antes de continuar.');
      setStep(0);
      return;
    }
    setErrorMsg('');
    try {
      const id = await createProject(cfg);
      openProject(id);
      // Aplica el horario a OpeningHour del negocio recién creado (createProject
      // ya creó su sucursal). NO se reintenta creando otro proyecto: el aviso
      // del helper cubre el fallo sin bloquear la navegación.
      await syncHorarioConAviso(cfg);
      router.replace('/panel');
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      setErrorMsg(msg || 'No se pudo crear el proyecto. Verifica que tienes sesión activa y el backend responde.');
    }
  }

  const activeCount = Object.values(draft.modules).filter(Boolean).length;

  return (
    // Onboarding hereda el tema (claro/oscuro) vía .crm-console: rejilla de fondo
    // en todo el main + tokens --panel-* que voltean con data-theme. Los grises
    // fijos del diseño se remapean a tokens en globals.css (scope .onboarding).
    <div className="crm-console onboarding min-h-screen"
      style={{ '--brand-primary': draft.branding.primary, '--brand-secondary': draft.branding.secondary } as React.CSSProperties}>
      <div className="mx-auto max-w-4xl px-5 py-10">
        <Button variant="ghost" onClick={() => router.push('/dashboard')} className="mb-6">
          <ChevronLeft className="h-4 w-4" /> Volver a proyectos
        </Button>
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
            {/* Cliente primero: al elegirlo se pre-rellena nombre/email/teléfono/dirección. */}
            <Card><CardBody>
              <ClientCombobox clients={clients} selectedId={draft.business.clienteId} onPick={pickClient} error={clientsError} />
            </CardBody></Card>

            <VerticalPicker value={pickedVertical} onChange={pickVertical} />
          </div>
        )}

        {step === 1 && (
          <>
            <p className="mb-3 text-sm text-gray-500">{activeCount} módulos activos. Activa o desactiva lo que necesites.{isEdit ? ' Al desactivar un apartado se oculta; sus datos se conservan.' : ''}</p>
            <ModuleToggleGrid modules={draft.modules} onToggle={toggle} terminology={draft.terminology}
              vertical={draft.business.vertical} emojis={draft.moduleEmojis}
              views={draft.views ?? DEFAULT_VIEWS} onViewsChange={changeViews}
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
                  <input autoComplete="off" value={draft.database?.[k] ?? ''} onChange={(e) => db({ [k]: e.target.value } as Partial<NonNullable<typeof draft.database>>)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-500">Contraseña</label>
                <input type="password" autoComplete="new-password" value={draft.database?.password ?? ''} onChange={(e) => db({ password: e.target.value })}
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
            {/* Horario de apertura del negocio, debajo de la dirección: alimenta
                los chips de "horas disponibles" del calendario (OpeningHour). */}
            <HorarioNegocioForm value={draft.horario}
              onChange={(h) => setDraft((d) => ({ ...d, horario: h }))} />
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800">Resumen</p>
              <p className="mt-1">Negocio: {draft.business.name || '—'} · {VERTICAL_MAP[draft.business.vertical].label}</p>
              <p>Módulos activos: {activeCount}</p>
            </div>
          </CardBody></Card>
        )}

        {errorMsg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
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
