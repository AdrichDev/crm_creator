'use client';
import { MODULES, CATEGORY_LABEL, type ModuleCategory, type ModuleId } from '@/lib/config/modules';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/primitives';
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
              const color = CATEGORY_COLOR[m.category];
              return (
                <div key={m.id}
                  className={cn('flex items-start gap-3 rounded-2xl border p-4 transition',
                    on ? 'border-[#2563eb]/50' : 'border-gray-200 bg-gray-50')}
                  // Seleccionada → tinte azul translúcido que deja transpirar el fondo del tema.
                  style={on ? { backgroundColor: 'rgba(37,99,235,0.10)' } : undefined}>
                  {/* Icono coloreado por categoría (tinte de fondo + trazo del mismo tono). */}
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
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
