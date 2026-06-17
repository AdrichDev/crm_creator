'use client';
import { WORKER_CHIPS, type WorkerChipId } from '@/lib/config/worker-chips';
import { MODULE_MAP, type ModuleId } from '@/lib/config/modules';
import { Icon } from '@/components/ui/icon';
import { Card, CardBody, Toggle } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Panel de control del admin para los chips del dashboard del trabajador.
 * Mismo look que `ModuleGridPanel` (tokens --panel-*). Un chip cuyo módulo
 * dependiente está apagado se muestra deshabilitado, con aviso.
 */
export function WorkerChipsGrid({ chips, modules, onToggle }:
  { chips: Record<WorkerChipId, boolean>; modules: Record<ModuleId, boolean>; onToggle: (id: WorkerChipId, on: boolean) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {WORKER_CHIPS.map((c) => {
        const on = chips[c.id];
        const blocked = !!c.dependsOn && !modules[c.dependsOn];
        const depLabel = c.dependsOn ? MODULE_MAP[c.dependsOn]?.defaultLabel ?? c.dependsOn : '';
        return (
          <Card key={c.id} className={cn('transition', on && !blocked && 'border-[var(--acc)]/40', blocked && 'opacity-60')}>
            <CardBody className="flex items-start gap-3 p-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-[var(--acc)]">
                <Icon name={c.icon} className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">{c.label}</p>
                <p className="mt-0.5 text-xs text-[var(--panel-muted)]">{c.description}</p>
                {blocked && (
                  <p className="mt-1 text-[11px] text-amber-400">Requiere el módulo «{depLabel}» activo.</p>
                )}
              </div>
              <Toggle checked={on && !blocked} disabled={blocked} onChange={(v) => onToggle(c.id, v)} />
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
