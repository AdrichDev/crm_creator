'use client';
import { MODULES, CATEGORY_LABEL, type ModuleCategory, type ModuleId } from '@/lib/config/modules';
import { Icon } from '@/components/ui/icon';
import { Card, CardBody, Toggle } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Selector de módulos con el look del panel (tokens --panel-*), para la pantalla
 * de Configuración. Misma lógica que `ModuleToggleGrid` (onboarding) pero tematizado
 * claro/oscuro en vez del estilo claro del wizard.
 */
export function ModuleGridPanel({ modules, onToggle, terminology = {} }:
  { modules: Record<ModuleId, boolean>; onToggle: (id: ModuleId, on: boolean) => void; terminology?: Record<string, string> }) {
  const cats = Array.from(new Set(MODULES.map((m) => m.category))) as ModuleCategory[];
  return (
    <div className="space-y-6">
      {cats.map((cat) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--panel-muted)]">{CATEGORY_LABEL[cat]}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODULES.filter((m) => m.category === cat).map((m) => {
              const on = modules[m.id];
              const label = terminology[m.termKey] ?? m.defaultLabel;
              const missing = (m.recommends ?? []).filter((r) => !modules[r]);
              return (
                <Card key={m.id} className={cn('transition', on && 'border-[var(--acc)]/40')}>
                  <CardBody className="flex items-start gap-3 p-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-[var(--acc)]">
                      <Icon name={m.icon} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white">{label}</p>
                        {m.mandatory && <span className="text-[10px] font-medium uppercase text-[var(--panel-muted)]">obligatorio</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--panel-muted)]">{m.description}</p>
                      {on && missing.length > 0 && (
                        <p className="mt-1 text-[11px] text-amber-400">Recomendado activar: {missing.join(', ')}</p>
                      )}
                    </div>
                    <Toggle checked={on} disabled={m.mandatory} onChange={(v) => onToggle(m.id, v)} />
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
