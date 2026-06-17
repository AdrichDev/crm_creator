'use client';
// Selector de modelo LLM + reasoning_effort para el asistente (réplica del de
// agents-agency: ModelEffortSelect). Fuente única: lib/config/models.ts. Themed
// para el onboarding (claro/oscuro) vía las utilidades remapeadas en .onboarding.

import { LLM_PROVIDERS, REASONING_EFFORTS, modelSupportsEffort } from '@/lib/config/models';

export function ModelEffortSelect({ model, effort, onModelChange, onEffortChange }:
  { model: string; effort: string; onModelChange: (m: string) => void; onEffortChange: (e: string) => void }) {
  const showEffort = modelSupportsEffort(model);
  const selectCls = 'mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-medium text-gray-500">Modelo de IA</label>
        <select className={selectCls} value={model} onChange={(e) => onModelChange(e.target.value)}>
          {LLM_PROVIDERS.map((p) => (
            <optgroup key={p.id} label={p.label}>
              {p.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className={`text-xs font-medium text-gray-500 ${showEffort ? '' : 'opacity-40'}`}>Esfuerzo de razonamiento</label>
        <select className={selectCls} value={effort} onChange={(e) => onEffortChange(e.target.value)} disabled={!showEffort}>
          {REASONING_EFFORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {!showEffort && <p className="mt-1 text-[11px] text-gray-400">Solo aplica a modelos GPT-5*.</p>}
      </div>
    </div>
  );
}
