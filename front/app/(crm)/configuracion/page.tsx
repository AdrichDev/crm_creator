'use client';
import { useEffect, useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { useTenantConfig, useRole } from '@/lib/tenant-config-context';
import { ModuleGuard } from '@/components/layout/module-guard';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { HorarioNegocioForm } from '@/components/config/horario-negocio-form';
import { type BusinessSchedule, type TramoDia, scheduleFromTramos, scheduleToTramos } from '@/lib/config/schedule';
import { apiFetch } from '@/lib/api/client';
import { BrandingForm } from '@/components/config/branding-form';
import { ModuleGridPanel } from '@/components/config/module-grid-panel';
import { WorkerChipsGrid } from '@/components/config/worker-chips-grid';
import { DashboardWidgetsGrid } from '@/components/config/dashboard-widgets-grid';
import { UsersPanel } from '@/components/config/users-panel';
import { ChangePasswordForm } from '@/components/config/change-password-form';
import { MyAccountPanel } from '@/components/config/my-account-panel';
import { NotificacionesPanel } from '@/components/config/notificaciones-panel';
import { IntegracionesPanel } from '@/components/config/integraciones-panel';
import { TenantKeysPanel } from '@/components/config/tenant-keys-panel';
import { PageHeader, Card, CardBody, Button, Badge, Toggle } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import { getAuthProfile } from '@/lib/api/profile';
import { getActiveBusinessId } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

type Tab = 'estado' | 'modulos' | 'trabajador' | 'inicio' | 'usuarios' | 'notificaciones' | 'integraciones' | 'claves-api' | 'marca' | 'negocio' | 'cuenta';
const TAB_LABEL: Record<Tab, string> = { estado: 'Estado', modulos: 'Módulos', trabajador: 'Trabajador', inicio: 'Widgets del inicio', usuarios: 'Usuarios', notificaciones: 'Notificaciones', integraciones: 'Integraciones', 'claves-api': 'Claves API', marca: 'Marca', negocio: 'Negocio', cuenta: 'Mi Cuenta' };
const BASE_TABS: Tab[] = ['estado', 'modulos', 'trabajador', 'inicio', 'marca', 'negocio', 'cuenta'];

export default function ConfiguracionPage() {
  const { config, update, reset, toggleModule, setModuleEmoji, toggleWorkerChip, toggleDashboardWidget } = useTenantConfig();
  const { role } = useRole();
  const isAdmin = role === 'admin';
  const apiEnabled = isApiEnabled();
  const dialog = useDialog();

  // "Claves API" (autoservicio de secretos del tenant) se gatea por el MemberRole CRUDO
  // (ADMIN/MANAGER) de GET /auth/me — NO por el `Role` colapsado de useRole() (que funde
  // MANAGER y EMPLOYEE en 'trabajador'). El backend compartido es la autoridad final (403
  // para EMPLOYEE/CLIENT); este gate solo evita mostrar una pestaña que daría 403.
  // Fail-closed: mientras el rol no se resuelve, `memberRole` es null y la pestaña se oculta.
  const [memberRole, setMemberRole] = useState<string | null>(null);
  // businessId de la sesión ACTIVA (el mismo que `apiFetch` envía como x-business-id).
  // Nunca proviene de input del usuario; se resuelve de la sesión.
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);

  useEffect(() => {
    setActiveBusinessId(getActiveBusinessId());
    if (!apiEnabled) return;
    let cancel = false;
    getAuthProfile()
      .then((p) => { if (!cancel) setMemberRole(p.role ?? null); })
      .catch(() => { if (!cancel) setMemberRole(null); });
    return () => { cancel = true; };
  }, [apiEnabled]);

  const canManageKeys = apiEnabled && (memberRole === 'ADMIN' || memberRole === 'MANAGER');

  // El tab "Usuarios" (gestión de cuentas + cambio de contraseña) es solo para admin.
  // "Notificaciones" (solo lectura) e "Integraciones" (OAuth Google) requieren back
  // → solo admin + modo API. "Mi Cuenta" es accesible para todos los roles.
  const TABS: Tab[] = (() => {
    const tabs: Tab[] = isAdmin
      ? ['estado', 'modulos', 'trabajador', 'inicio', 'usuarios',
         ...(apiEnabled ? ['notificaciones' as Tab, 'integraciones' as Tab] : []), 'marca', 'negocio', 'cuenta']
      : [...BASE_TABS];
    // "Claves API" visible para ADMIN y MANAGER (independiente de isAdmin, que solo cubre ADMIN).
    if (canManageKeys) {
      const idx = tabs.indexOf('cuenta');
      tabs.splice(idx >= 0 ? idx : tabs.length, 0, 'claves-api');
    }
    return tabs;
  })();

  const [tab, setTab] = useState<Tab>('estado');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  function guardar() {
    // Los cambios ya persisten en vivo; el botón da feedback explícito de guardado.
    setSaving(true); setSaved(false);
    setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1800); }, 700);
  }

  // Horario de apertura del negocio (reutiliza HorarioNegocioForm del onboarding).
  // Prefill desde las horas REALES (OpeningHour) vía GET /config/horario en modo API;
  // en modo demo cae a config.horario. El guardado es EXPLÍCITO (PUT /config/horario):
  // el `update` genérico del panel es efímero en BD, así que las horas se persisten aquí.
  const [horario, setHorario] = useState<BusinessSchedule | undefined>(config.horario);
  const [savingHorario, setSavingHorario] = useState(false);

  useEffect(() => {
    if (tab !== 'negocio' || !apiEnabled || !isAdmin) return;
    let cancel = false;
    apiFetch<{ tramos: TramoDia[] }>('/config/horario')
      .then((data) => { if (!cancel) setHorario(scheduleFromTramos(data.tramos ?? [])); })
      .catch(() => { /* sin sucursal o sin horario: se mantiene el estado local */ });
    return () => { cancel = true; };
  }, [tab, apiEnabled, isAdmin]);

  async function guardarHorario() {
    setSavingHorario(true);
    try {
      if (apiEnabled) {
        await apiFetch('/config/horario', {
          method: 'PUT',
          body: JSON.stringify({ tramos: scheduleToTramos(horario) }),
        });
      }
      // Mantiene la config local en sincronía con lo persistido en OpeningHour.
      update({ horario });
      await dialog.alert('Horario guardado correctamente.');
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      await dialog.alert(`No se pudo guardar el horario${msg ? ` (${msg})` : ''}.`);
    } finally {
      setSavingHorario(false);
    }
  }

  const enabled = config.tenantEnabled !== false;

  return (
    <ModuleGuard module="configuracion">
      <PageHeader title="Configuración" subtitle="Estado del tenant, marca y datos del negocio."
        action={
          <div className="flex items-center gap-2">
            {saved && <Badge tone="green">Guardado</Badge>}
            <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        } />

      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition',
              tab === t ? 'text-[var(--acc)]' : 'text-gray-400 hover:text-[var(--hover-text)]')}
            style={tab === t ? { background: 'color-mix(in srgb, var(--acc) 18%, transparent)' } : undefined}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Estado del tenant: interruptor maestro */}
      {tab === 'estado' && (
        <Card><CardBody className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-white">Tenant activo</p>
              <p className="mt-1 text-sm text-[var(--panel-muted)]">
                Apaga el tenant completo para mantenimiento, actualizaciones o sincronización con la base de datos.
                Mientras esté apagado, el panel queda en modo mantenimiento.
              </p>
            </div>
            <Toggle checked={enabled} onChange={(v) => update({ tenantEnabled: v })} />
          </div>
          <Badge tone={enabled ? 'green' : 'red'}>{enabled ? 'Operativo' : 'En mantenimiento'}</Badge>
        </CardBody></Card>
      )}

      {/* Módulos: activa/desactiva funcionalidades del CRM (incl. Facturación) */}
      {tab === 'modulos' && (
        <Card><CardBody className="space-y-4">
          <p className="text-sm text-[var(--panel-muted)]">
            Activa o desactiva los módulos del panel. Los obligatorios no se pueden apagar.
          </p>
          <ModuleGridPanel modules={config.modules} onToggle={toggleModule} terminology={config.terminology}
            vertical={config.business.vertical} emojis={config.moduleEmojis} onSetEmoji={setModuleEmoji} />
        </CardBody></Card>
      )}

      {/* Trabajador: chips configurables del dashboard del rol trabajador */}
      {tab === 'trabajador' && (
        <Card><CardBody className="space-y-4">
          <p className="text-sm text-[var(--panel-muted)]">
            Activa los chips (accesos rápidos) que verá el trabajador en su panel.
            Un chip cuyo módulo dependiente esté apagado no se puede activar.
          </p>
          <WorkerChipsGrid chips={config.workerChips} modules={config.modules} onToggle={toggleWorkerChip} />
        </CardBody></Card>
      )}

      {/* Inicio: hasta 6 widgets favoritos del dashboard (admin/trabajador) */}
      {tab === 'inicio' && (
        <Card><CardBody className="space-y-4">
          <p className="text-sm text-[var(--panel-muted)]">
            Elige hasta 6 widgets para el inicio. Un widget sin módulo activo no se puede elegir.
          </p>
          <DashboardWidgetsGrid
            selected={config.dashboardWidgets}
            modules={config.modules}
            onToggle={toggleDashboardWidget}
          />
        </CardBody></Card>
      )}

      {/* Usuarios: gestión de cuentas del negocio + cambio de contraseña (solo admin) */}
      {tab === 'usuarios' && isAdmin && (
        <div className="space-y-6">
          <UsersPanel />
          <ChangePasswordForm />
        </div>
      )}

      {/* Notificaciones: historial del sistema, solo lectura (admin + modo API) */}
      {tab === 'notificaciones' && isAdmin && apiEnabled && (
        <Card><CardBody className="space-y-4">
          <p className="text-sm text-[var(--panel-muted)]">
            Historial de notificaciones que envía el sistema (recordatorios, avisos). Solo lectura.
          </p>
          <NotificacionesPanel />
        </CardBody></Card>
      )}

      {/* Integraciones: OAuth de Google (Calendar/Gmail) por negocio (admin + modo API).
          Mismo panel que /ajustes/integraciones, destino del retorno del consentimiento. */}
      {tab === 'integraciones' && isAdmin && apiEnabled && (
        <Card><CardBody className="space-y-4">
          <p className="text-sm text-[var(--panel-muted)]">
            Conecta el negocio con Google Calendar y Gmail. Cada negocio usa su propia cuenta de Google.
          </p>
          <IntegracionesPanel />
        </CardBody></Card>
      )}

      {/* Claves API: autoservicio de secretos del tenant (IA, Google Maps, URL de BD).
          Reutiliza el TenantKeysPanel compartido con el businessId de la sesión activa.
          Gateado por el MemberRole crudo (ADMIN/MANAGER); defensa en profundidad en el
          render además del gate de TABS. El valor de cada secreto nunca se muestra. */}
      {tab === 'claves-api' && canManageKeys && activeBusinessId && (
        <Card><CardBody className="space-y-4">
          <p className="text-sm text-[var(--panel-muted)]">
            Gestiona las claves de tus proveedores de IA (OpenAI, Gemini, Anthropic), tu clave de
            Google Maps y la URL de tu base de datos. Los valores no se muestran una vez guardados.
          </p>
          <TenantKeysPanel businessId={activeBusinessId} />
        </CardBody></Card>
      )}

      {/* Mi Cuenta: nombre, apellido, teléfono y contraseña del usuario logado (todos los roles) */}
      {tab === 'cuenta' && <MyAccountPanel />}

      {tab === 'marca' && (
        <BrandingForm primary={config.branding.primary} secondary={config.branding.secondary} logoText={config.branding.logoText}
          logoImage={config.branding.logoImage} logoImage2={config.branding.logoImage2} designSource={config.branding.designSource}
          onChange={(patch) => update({ branding: { ...config.branding, ...patch } })} />
      )}

      {tab === 'negocio' && (
        <Card><CardBody className="space-y-4">
          <div>
            <label className="opera-label">Nombre</label>
            <input value={config.business.name}
              onChange={(e) => update({ business: { ...config.business, name: e.target.value } })}
              className="opera-control" />
          </div>
          {([['phone', 'Teléfono'], ['email', 'Email'], ['address', 'Dirección']] as const).map(([k, label]) => (
            <div key={k}>
              <label className="opera-label">{label}</label>
              <input value={(config.business as Record<string, string>)[k] ?? ''}
                onChange={(e) => update({ business: { ...config.business, [k]: e.target.value } })}
                className="opera-control" />
            </div>
          ))}
          <p className="text-xs text-[var(--panel-muted)]">Tipo: {VERTICAL_MAP[config.business.vertical].label}</p>
          {/* Horario de apertura (mismo editor que el onboarding). Alimenta los chips
              de horas disponibles del calendario (OpeningHour). Guardado explícito. */}
          {isAdmin && (
            <div className="border-t border-white/10 pt-4 space-y-3">
              <HorarioNegocioForm value={horario} onChange={setHorario} />
              <Button onClick={guardarHorario} disabled={savingHorario}>
                {savingHorario ? 'Guardando…' : 'Guardar horario'}
              </Button>
            </div>
          )}
          {isAdmin && (
            <div className="border-t border-white/10 pt-4">
              <Button variant="outline" onClick={() => { void dialog.confirm({ message: '¿Reiniciar toda la configuración?', danger: true }).then((ok) => { if (ok) reset(); }); }}>Reiniciar configuración</Button>
            </div>
          )}
        </CardBody></Card>
      )}
    </ModuleGuard>
  );
}
