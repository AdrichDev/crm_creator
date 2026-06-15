'use client';
import { MODULES, CATEGORY_LABEL, type ModuleCategory, type ModuleId } from '@/lib/config/modules';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export function ModuleToggleGrid({ modules, onToggle, terminology = {} }:
  { modules: Record<ModuleId, boolean>; onToggle: (id: ModuleId, on: boolean) => void; terminology?: Record<string, string> }) {
  const cats = Array.from(new Set(MODULES.map((m) => m.category))) as ModuleCategory[];
  return (
    <div className="space-y-6">
      {cats.map((cat) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{CATEGORY_LABEL[cat]}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODULES.filter((m) => m.category === cat).map((m) => {
              const on = modules[m.id];
              const label = terminology[m.termKey] ?? m.defaultLabel;
              const missing = (m.recommends ?? []).filter((r) => !modules[r]);
              return (
                <div key={m.id} className={cn('flex items-start gap-3 rounded-2xl border p-4 transition',
                  on ? 'border-[var(--brand-primary)]/40 bg-white' : 'border-gray-200 bg-gray-50')}>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600">
                    <Icon name={m.icon} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{label}</p>
                      {m.mandatory && <span className="text-[10px] font-medium uppercase text-gray-400">obligatorio</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>
                    {on && missing.length > 0 && (
                      <p className="mt-1 text-[11px] text-amber-600">Recomendado activar: {missing.join(', ')}</p>
                    )}
                  </div>
                  <Toggle checked={on} disabled={m.mandatory} onChange={(v) => onToggle(m.id, v)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
