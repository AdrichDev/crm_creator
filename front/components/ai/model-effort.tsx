'use client';
// Selector unificado de modelo LLM + reasoning_effort. Fuente única:
// lib/config/models.ts. Dos variantes de estilo:
//   - 'opera'  → clases opera-* (estadísticas, marketing)
//   - 'config' → clases grises del onboarding (ai-branding-suggest)
// Comportamiento idéntico en ambas: optgroups de LLM_PROVIDERS y el select de
// effort deshabilitado cuando modelSupportsEffort(model) es false.

import { LLM_PROVIDERS, REASONING_EFFORTS, modelSupportsEffort } from '@/lib/config/models';

export function ModelEffort({ model, effort, onModel, onEffort, variant }: {
  model: string;
  effort: string;
  onModel: (m: string) => void;
  onEffort: (e: string) => void;
  variant: 'opera' | 'config';
}) {
  const supportsEffort = modelSupportsEffort(model);
  const options = (
    <>
      {LLM_PROVIDERS.map((p) => (
        <optgroup key={p.id} label={p.label}>
          {p.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      ))}
    </>
  );
  const efforts = REASONING_EFFORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>);

  if (variant === 'config') {
    const selectCls = 'mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm';
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Modelo de IA</label>
          <select className={selectCls} value={model} onChange={(e) => onModel(e.target.value)}>
            {options}
          </select>
        </div>
        <div>
          <label className={`text-xs font-medium text-gray-500 ${supportsEffort ? '' : 'opacity-40'}`}>Esfuerzo de razonamiento</label>
          <select className={selectCls} value={effort} onChange={(e) => onEffort(e.target.value)} disabled={!supportsEffort}>
            {efforts}
          </select>
          {!supportsEffort && <p className="mt-1 text-[11px] text-gray-400">Solo aplica a modelos GPT-5*.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="opera-field">
        <label className="opera-label">Modelo</label>
        <select className="opera-control" value={model} onChange={(e) => onModel(e.target.value)}>
          {options}
        </select>
      </div>
      <div className="opera-field">
        <label className="opera-label">Effort {supportsEffort ? '' : '(no aplica)'}</label>
        <select className="opera-control" value={effort} disabled={!supportsEffort} onChange={(e) => onEffort(e.target.value)}>
          {efforts}
        </select>
      </div>
    </div>
  );
}
