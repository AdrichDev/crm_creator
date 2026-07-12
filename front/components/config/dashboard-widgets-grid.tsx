'use client';
import { DASHBOARD_WIDGETS, MAX_DASHBOARD_WIDGETS, type WidgetId } from '@/lib/config/dashboard-widgets';
import { MODULE_MAP, type ModuleId } from '@/lib/config/modules';
import { Icon } from '@/components/ui/icon';
import { Card, CardBody, Toggle } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Panel de control del admin para los widgets favoritos del inicio (máx. 6).
 * Mismo patrón visual que WorkerChipsGrid. Un widget sin módulo activo se
 * deshabilita con aviso; al llegar al máximo, el resto se deshabilita también.
 */
export function DashboardWidgetsGrid({ selected, modules, onToggle }: {
  selected: WidgetId[];
  modules: Record<ModuleId, boolean>;
  onToggle: (id: WidgetId, on: boolean) => void;
}) {
  const atMax = selected.length >= MAX_DASHBOARD_WIDGETS;

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-[var(--panel-muted)]">
        {selected.length}/{MAX_DASHBOARD_WIDGETS} widgets elegidos
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {DASHBOARD_WIDGETS.map((w) => {
          const on = selected.includes(w.id);
          const blockedByModule = !!w.dependsOn && !modules[w.dependsOn];
          const blockedByMax = !on && atMax;
          const blocked = blockedByModule || blockedByMax;
          const depLabel = w.dependsOn ? MODULE_MAP[w.dependsOn]?.defaultLabel ?? w.dependsOn : '';

          return (
            <Card key={w.id} className={cn('transition', on && !blockedByModule && 'border-[var(--acc)]/40', blocked && 'opacity-60')}>
              <CardBody className="flex items-start gap-3 p-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-[var(--acc)]">
                  <Icon name={w.icon} className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-white">
                    {w.label}
                    {w.kind === 'acceso' && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-[var(--panel-muted)]">Atajo</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--panel-muted)]">{w.description}</p>
                  {blockedByModule && (
                    <p className="mt-1 text-[11px] text-amber-400">Requiere el módulo «{depLabel}» activo.</p>
                  )}
                  {blockedByMax && (
                    <p className="mt-1 text-[11px] text-amber-400">Ya tienes {MAX_DASHBOARD_WIDGETS} widgets elegidos.</p>
                  )}
                </div>
                <Toggle checked={on && !blockedByModule} disabled={blocked} onChange={(v) => onToggle(w.id, v)} />
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
