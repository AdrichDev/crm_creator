'use client';
import { useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { useTenantConfig, useRole } from '@/lib/tenant-config-context';
import { ModuleGuard } from '@/components/layout/module-guard';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { BrandingForm } from '@/components/config/branding-form';
import { ModuleGridPanel } from '@/components/config/module-grid-panel';
import { WorkerChipsGrid } from '@/components/config/worker-chips-grid';
import { DashboardWidgetsGrid } from '@/components/config/dashboard-widgets-grid';
import { UsersPanel } from '@/components/config/users-panel';
import { ChangePasswordForm } from '@/components/config/change-password-form';
import { MyAccountPanel } from '@/components/config/my-account-panel';
import { PageHeader, Card, CardBody, Button, Badge, Toggle } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Tab = 'estado' | 'modulos' | 'trabajador' | 'inicio' | 'usuarios' | 'marca' | 'negocio' | 'cuenta';
const TAB_LABEL: Record<Tab, string> = { estado: 'Estado', modulos: 'Módulos', trabajador: 'Trabajador', inicio: 'Widgets del inicio', usuarios: 'Usuarios', marca: 'Marca', negocio: 'Negocio', cuenta: 'Mi Cuenta' };
const BASE_TABS: Tab[] = ['estado', 'modulos', 'trabajador', 'inicio', 'marca', 'negocio', 'cuenta'];

export default function ConfiguracionPage() {
  const { config, update, reset, toggleModule, setModuleEmoji, toggleWorkerChip, toggleDashboardWidget } = useTenantConfig();
  const { role } = useRole();
  const isAdmin = role === 'admin';
  const dialog = useDialog();

  // El tab "Usuarios" (gestión de cuentas + cambio de contraseña) es solo para admin.
  // "Mi Cuenta" es accesible para todos los roles.
  const TABS: Tab[] = isAdmin
    ? ['estado', 'modulos', 'trabajador', 'inicio', 'usuarios', 'marca', 'negocio', 'cuenta']
    : BASE_TABS;

  const [tab, setTab] = useState<Tab>('estado');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  function guardar() {
    // Los cambios ya persisten en vivo; el botón da feedback explícito de guardado.
    setSaving(true); setSaved(false);
    setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1800); }, 700);
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
              tab === t ? 'text-[var(--acc)]' : 'text-gray-400 hover:text-white')}
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

      {/* Mi Cuenta: nombre, apellido, teléfono y contraseña del usuario logado (todos los roles) */}
      {tab === 'cuenta' && <MyAccountPanel />}

      {tab === 'marca' && (
        <BrandingForm primary={config.branding.primary} secondary={config.branding.secondary} logoText={config.branding.logoText}
          logoImage={config.branding.logoImage} designSource={config.branding.designSource}
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
