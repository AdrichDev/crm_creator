'use client';
import { useState } from 'react';
import { useTenantConfig } from '@/lib/tenant-config-context';
import { VERTICALS, VERTICAL_MAP, type VerticalId } from '@/lib/config/verticals';
import { ModuleToggleGrid } from '@/components/config/module-toggle-grid';
import { BrandingForm } from '@/components/config/branding-form';
import { PageHeader, Card, CardBody, Button, Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Tab = 'modulos' | 'marca' | 'negocio';

export default function ConfiguracionPage() {
  const { config, toggleModule, update, applyVertical, reset } = useTenantConfig();
  const [tab, setTab] = useState<Tab>('modulos');
  const [saved, setSaved] = useState(false);

  function flashSaved() { setSaved(true); setTimeout(() => setSaved(false), 1500); }

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Activa módulos, ajusta tu marca y los datos del negocio."
        action={saved ? <Badge tone="green">Guardado</Badge> : undefined} />

      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {(['modulos', 'marca', 'negocio'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
            {t === 'modulos' ? 'Módulos' : t === 'marca' ? 'Marca' : 'Negocio'}
          </button>
        ))}
      </div>

      {tab === 'modulos' && (
        <div className="space-y-5">
          <Card><CardBody className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">Aplicar preset de un tipo de negocio:</span>
            <select value={config.business.vertical}
              onChange={(e) => { applyVertical(e.target.value as VerticalId); flashSaved(); }}
              className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm">
              {VERTICALS.map((v) => <option key={v.id} value={v.id}>{v.emoji} {v.label}</option>)}
            </select>
            <span className="text-xs text-gray-400">Reaplica módulos y terminología recomendados.</span>
          </CardBody></Card>
          <ModuleToggleGrid modules={config.modules} terminology={config.terminology}
            onToggle={(id, on) => { toggleModule(id, on); flashSaved(); }} />
        </div>
      )}

      {tab === 'marca' && (
        <BrandingForm primary={config.branding.primary} secondary={config.branding.secondary} logoText={config.branding.logoText}
          logoImage={config.branding.logoImage} designSource={config.branding.designSource}
          onChange={(patch) => { update({ branding: { ...config.branding, ...patch } }); flashSaved(); }} />
      )}

      {tab === 'negocio' && (
        <Card><CardBody className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Nombre</label>
            <input value={config.business.name}
              onChange={(e) => update({ business: { ...config.business, name: e.target.value } })}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </div>
          {([['phone', 'Teléfono'], ['email', 'Email'], ['address', 'Dirección']] as const).map(([k, label]) => (
            <div key={k}>
              <label className="text-xs font-medium text-gray-500">{label}</label>
              <input value={(config.business as Record<string, string>)[k] ?? ''}
                onChange={(e) => update({ business: { ...config.business, [k]: e.target.value } })}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
            </div>
          ))}
          <p className="text-xs text-gray-400">Tipo: {VERTICAL_MAP[config.business.vertical].label}</p>
          <div className="border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={() => { if (confirm('¿Reiniciar toda la configuración?')) reset(); }}>Reiniciar configuración</Button>
          </div>
        </CardBody></Card>
      )}
    </div>
  );
}
