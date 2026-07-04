'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { computePedidoMetrics, type PedidoMetrics, type PedidoForMetrics } from '@/lib/pedidos/metrics';

const EMPTY_METRICS: PedidoMetrics = { totalPedidos: 0, aceptados: 0, importeTotal: 0 };

/**
 * Métricas (KPIs) de la vista Pedidos. Espejo de `use-invoice-metrics.ts` (PR-3).
 *
 * Modo API (`enabled=true`, staff): se LEEN del back. `GET /pedidos` devuelve
 *   `{ items, total, page, limit, metrics }` y calcula `metrics` SERVER-SIDE sobre TODOS los
 *   pedidos del negocio. Así los KPIs son correctos aunque el listado esté paginado (default
 *   20 por página): antes se derivaban en el front con `items.filter/reduce` sobre esa página
 *   → en negocios con más pedidos los KPIs quedaban subcontados sin ningún aviso visual.
 *
 * Modo local/demo (`enabled=false`): NO hay back ni paginación — `localBackend.list()` devuelve
 *   el array COMPLETO. Se calcula en cliente con `computePedidoMetrics` sobre ese array, que es
 *   correcto por construcción. Ver `front/lib/pedidos/metrics.ts`.
 */
export function usePedidoMetrics(enabled: boolean, localItems: PedidoForMetrics[]) {
  const [serverMetrics, setServerMetrics] = useState<PedidoMetrics | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) { setServerMetrics(null); return; }
    try {
      const r = await apiFetch<{ metrics?: PedidoMetrics }>('/pedidos');
      setServerMetrics(r?.metrics ?? EMPTY_METRICS);
    } catch { setServerMetrics(EMPTY_METRICS); }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  // API: valor server-side (mientras carga → EMPTY, evita KPIs erróneos). Local: cálculo
  // cliente sobre el array completo (correcto, sin paginación).
  const metrics = enabled ? (serverMetrics ?? EMPTY_METRICS) : computePedidoMetrics(localItems);

  return { metrics, refresh };
}
