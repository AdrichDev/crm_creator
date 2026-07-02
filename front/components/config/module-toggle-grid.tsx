'use client';
import { MODULES, CATEGORY_LABEL, type ModuleCategory, type ModuleId } from '@/lib/config/modules';
import { effectiveCategory, groupModules } from '@/lib/config/module-category';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/primitives';
import { EmojiPickerButton } from '@/components/ui/emoji-picker';
import { resolveModuleEmoji } from '@/lib/config/icons';
import type { VerticalId } from '@/lib/config/verticals';
import type { BusinessViews } from '@/lib/config/tenant-config';
import { DEFAULT_VIEWS } from '@/lib/config/tenant-config';
import { cn } from '@/lib/utils';

// Un color por categoría: todos los iconos de "Esencial" comparten tono, los de
// "Operativa" otro, etc. Colores sólidos (no tokens de tema) para que contrasten
// igual en claro y oscuro. Sirven de codificación visual de cada grupo.
const CATEGORY_COLOR: Record<ModuleCategory, string> = {
  core:      '#2563eb', // azul   — Esencial
  operativa: '#0d9488', // teal   — Operativa
  personas:  '#7c3aed', // violeta— Personas
  retail:    '#ea580c', // naranja— Retail / Caja
  marketing: '#db2777', // rosa   — Marketing y Web
};

export function ModuleToggleGrid({ modules, onToggle, terminology = {}, vertical, emojis, onSetEmoji, views = DEFAULT_VIEWS, onViewsChange }:
  { modules: Record<ModuleId, boolean>; onToggle: (id: ModuleId, on: boolean) => void; terminology?: Record<string, string>;
    vertical?: VerticalId; emojis?: Partial<Record<ModuleId, string>>; onSetEmoji?: (id: ModuleId, emoji: string) => void;
    views?: BusinessViews; onViewsChange?: (v: BusinessViews) => void }) {
  const groups = groupModules(MODULES, vertical);
  return (
    <div className="space-y-6">
      {onViewsChange && <ViewSelector views={views} onChange={onViewsChange} />}
      {groups.map(({ cat, items }) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{CATEGORY_LABEL[cat]}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((m) => {
              const on = modules[m.id];
              const label = terminology[m.termKey] ?? m.defaultLabel;
              const missing = (m.recommends ?? []).filter((r) => !modules[r]);
              const color = CATEGORY_COLOR[vertical ? effectiveCategory(vertical, m.id) : m.category];
              // Módulo de personas con la vista "Trabajador" desactivada: bloqueado.
              const blocked = !!m.requiresWorkerView && !views.worker;
              return (
                <div key={m.id}
                  title={blocked ? 'Requiere vista Trabajador' : undefined}
                  className={cn('flex items-start gap-3 rounded-2xl border p-4 transition',
                    on ? 'border-[var(--gold)]/50' : 'border-gray-200 bg-gray-50',
                    blocked && 'opacity-40 cursor-not-allowed')}
                  style={on ? { backgroundColor: 'color-mix(in srgb, var(--gold) 12%, var(--panel-card))' } : undefined}>
                  {/* Icono coloreado por categoría. Con vertical activo → emoji del sector. */}
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, var(--panel-card))`, color }}>
                    {vertical
                      ? <span className="text-base leading-none">{resolveModuleEmoji(vertical, m.id, emojis)}</span>
                      : <Icon name={m.icon} className="h-4 w-4" />}
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
                    {on && onSetEmoji && vertical && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                        Emoji del menú
                        <EmojiPickerButton
                          value={emojis?.[m.id]}
                          fallback={resolveModuleEmoji(vertical, m.id)}
                          onPick={(e) => onSetEmoji(m.id, e)}
                          label={`Emoji para ${m.defaultLabel}`}
                        />
                        <span className="opacity-60">→</span>
                        <span className="text-base">{resolveModuleEmoji(vertical, m.id, emojis)}</span>
                      </div>
                    )}
                  </div>
                  <Toggle checked={on} disabled={m.mandatory || blocked} onChange={(v) => onToggle(m.id, v)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Selector de accesos de la app. Admin siempre activa (no editable); Trabajador y
// Cliente son chips conmutables. Al apagar Trabajador, los módulos de personas se
// desactivan (lo gestiona `onViewsChange` en el onboarding).
function ViewSelector({ views, onChange }: { views: BusinessViews; onChange: (v: BusinessViews) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-900">¿Qué accesos incluye la app?</p>
      <div className="flex flex-wrap gap-2">
        <ViewChip label="Admin" hint="siempre" active disabled />
        <ViewChip label="Trabajador" active={views.worker}
          onClick={() => onChange({ ...views, worker: !views.worker })} />
        <ViewChip label="Cliente" active={views.client}
          onClick={() => onChange({ ...views, client: !views.client })} />
      </div>
    </div>
  );
}

function ViewChip({ label, hint, active, disabled, onClick }:
  { label: string; hint?: string; active: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      aria-pressed={active}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
        active ? 'border-emerald-500/60 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:border-gray-300')}>
      <Icon name={active ? 'Check' : 'X'} className="h-3.5 w-3.5" />
      {label}{hint && <span className="text-[11px] opacity-70">({hint})</span>}
    </button>
  );
}
