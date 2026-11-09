'use client';
// model-catalog (S8): hook del selector de modelos. Arranca con el respaldo estático (render
// inmediato, sin esperas), pide el catálogo al relé al montar y, si llega, lo sustituye.
// Si el relé falla, `fetchModelCatalog` ya devuelve el respaldo: aquí no hay estado de error
// que pintar y el selector nunca se queda vacío.
import { useEffect, useState } from 'react';
import { LLM_PROVIDERS, type LlmProvider } from '@/lib/config/models';
import { fetchModelCatalog } from '@/lib/ai/model-catalog';

export function useModelCatalog(): LlmProvider[] {
  const [providers, setProviders] = useState<LlmProvider[]>(LLM_PROVIDERS);

  useEffect(() => {
    let alive = true;
    fetchModelCatalog()
      .then((next) => {
        if (alive) setProviders(next);
      })
      .catch(() => {
        // `fetchModelCatalog` no lanza; esto es solo por si cambia en el futuro.
      });
    return () => {
      alive = false;
    };
  }, []);

  return providers;
}
