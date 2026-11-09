'use client';
// Selector unificado de modelo LLM + reasoning_effort. Dos variantes de estilo:
//   - 'opera'  → clases opera-* (estadísticas, marketing)
//   - 'config' → clases grises del onboarding (ai-branding-suggest)
//
// model-catalog (S8): la lista de proveedores/modelos YA NO está a mano aquí. Llega del
// catálogo de agents-agency por el relé `/api/models` (`useModelCatalog`), con la lista
// estática de `lib/config/models.ts` como respaldo si el relé falla. Los niveles de effort
// de cada modelo y su effort por defecto salen de los datos del propio modelo
// (`efforts` / `defaultEffort`), no de una tabla fija. El select de effort sigue
// deshabilitado cuando el modelo no razona.

import { useEffect } from 'react';
import { REASONING_EFFORTS, effortLabel, modelSupportsEffort } from '@/lib/config/models';
import { findCatalogModel } from '@/lib/ai/model-catalog';
import { useModelCatalog } from '@/lib/ai/use-model-catalog';

export function ModelEffort({ model, effort, onModel, onEffort, variant }: {
  model: string;
  effort: string;
  onModel: (m: string) => void;
  onEffort: (e: string) => void;
  variant: 'opera' | 'config';
}) {
  const providers = useModelCatalog();
  const current = findCatalogModel(providers, model);

  // Con el modelo en el catálogo manda su `efforts`; si no está (id heredado o catálogo aún
  // sin cargar) se cae a la tabla de respaldo y a la heurística de siempre.
  const modelEfforts = current?.efforts ?? [];
  const knownModel = current !== undefined;
  const supportsEffort = knownModel ? modelEfforts.length > 0 : modelSupportsEffort(model);
  const effortIds = supportsEffort && modelEfforts.length > 0 ? modelEfforts : REASONING_EFFORTS.map((r) => r.id);
  // Effort efectivo: si el que manda la página no aplica al modelo, se usa su defaultEffort.
  const fallbackEffort = current?.defaultEffort ?? effortIds[0];
  const effortValue = supportsEffort && !effortIds.includes(effort) ? fallbackEffort : effort;

  // Mantiene el estado de la página coherente con el modelo elegido (defaultEffort).
  useEffect(() => {
    if (effortValue !== effort) onEffort(effortValue);
  }, [effortValue, effort, onEffort]);

  function handleModelChange(next: string) {
    onModel(next);
    const entry = findCatalogModel(providers, next);
    const nextEfforts = entry?.efforts ?? [];
    if (nextEfforts.length === 0) return;
    // Si el effort actual no lo acepta el modelo nuevo, se aplica su defaultEffort.
    if (!nextEfforts.includes(effortValue)) onEffort(entry?.defaultEffort ?? nextEfforts[0]);
  }

  const options = (
    <>
      {providers.map((p) => (
        <optgroup key={p.id} label={p.label}>
          {p.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      ))}
    </>
  );
  const efforts = effortIds.map((id) => <option key={id} value={id}>{effortLabel(id)}</option>);

  if (variant === 'config') {
    const selectCls = 'mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm';
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Modelo de IA</label>
          <select className={selectCls} value={model} onChange={(e) => handleModelChange(e.target.value)}>
            {options}
          </select>
        </div>
        <div>
          <label className={`text-xs font-medium text-gray-500 ${supportsEffort ? '' : 'opacity-40'}`}>Esfuerzo de razonamiento</label>
          <select className={selectCls} value={effortValue} onChange={(e) => onEffort(e.target.value)} disabled={!supportsEffort}>
            {efforts}
          </select>
          {!supportsEffort && <p className="mt-1 text-[11px] text-gray-400">Solo aplica a modelos con razonamiento.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="opera-field">
        <label className="opera-label">Modelo</label>
        <select className="opera-control" value={model} onChange={(e) => handleModelChange(e.target.value)}>
          {options}
        </select>
      </div>
      <div className="opera-field">
        <label className="opera-label">Effort {supportsEffort ? '' : '(no aplica)'}</label>
        <select className="opera-control" value={effortValue} disabled={!supportsEffort} onChange={(e) => onEffort(e.target.value)}>
          {efforts}
        </select>
      </div>
    </div>
  );
}
