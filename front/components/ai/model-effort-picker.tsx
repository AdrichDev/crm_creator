'use client';
import { LLM_PROVIDERS, REASONING_EFFORTS, modelSupportsEffort } from '@/lib/config/models';

export function ModelEffortPicker({ model, effort, onModel, onEffort }: {
  model: string;
  effort: string;
  onModel: (m: string) => void;
  onEffort: (e: string) => void;
}) {
  const supportsEffort = modelSupportsEffort(model);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="opera-field">
        <label className="opera-label">Modelo</label>
        <select className="opera-control" value={model} onChange={(e) => onModel(e.target.value)}>
          {LLM_PROVIDERS.map((p) => (
            <optgroup key={p.id} label={p.label}>
              {p.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="opera-field">
        <label className="opera-label">Effort {supportsEffort ? '' : '(no aplica)'}</label>
        <select className="opera-control" value={effort} disabled={!supportsEffort} onChange={(e) => onEffort(e.target.value)}>
          {REASONING_EFFORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
    </div>
  );
}
