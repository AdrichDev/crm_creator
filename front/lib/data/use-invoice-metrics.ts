'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { computeInvoiceMetrics, type InvoiceMetrics, type InvoiceForMetrics } from '@/lib/invoices/metrics';

const EMPTY_METRICS: InvoiceMetrics = {
  totalFacturas: 0, importeTotal: 0,
  pendientes: 0, importePendiente: 0,
  pagadas: 0, importePagado: 0,
  anuladas: 0, importeAnulado: 0,
};

/**
 * Métricas (KPIs) de la vista Facturas.
 *
 * Modo API (`enabled=true`, staff): se LEEN del back. `GET /invoices` devuelve
 *   `{ items, total, page, limit, metrics }` y calcula `metrics` SERVER-SIDE sobre TODAS las
 *   facturas del negocio. Así los KPIs son correctos aunque el listado esté paginado. Este es
 *   el fix de PR-3: antes se derivaban en el front con `computeInvoiceMetrics(items)`, pero
 *   `items` es una sola página (máx. 100) → en negocios con más facturas los KPIs quedaban
 *   subcontados sin ningún aviso visual (invisible en demo, donde no hay paginación).
 *
 * Modo local/demo (`enabled=false`): NO hay back ni paginación — `localBackend.list()` devuelve
 *   el array COMPLETO. Se calcula en cliente con `computeInvoiceMetrics` sobre ese array, que es
 *   correcto por construcción (no hay página parcial que subcontar). Por eso la copia front de
 *   `computeInvoiceMetrics` se conserva: es el fallback SOLO para local/demo. Ver
 *   `front/lib/invoices/metrics.ts`.
 */
export function useInvoiceMetrics(enabled: boolean, localItems: InvoiceForMetrics[]) {
  const [serverMetrics, setServerMetrics] = useState<InvoiceMetrics | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) { setServerMetrics(null); return; }
    try {
      const r = await apiFetch<{ metrics?: InvoiceMetrics }>('/invoices');
      setServerMetrics(r?.metrics ?? EMPTY_METRICS);
    } catch { setServerMetrics(EMPTY_METRICS); }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  // API: valor server-side (mientras carga → EMPTY, evita KPIs erróneos). Local: cálculo
  // cliente sobre el array completo (correcto, sin paginación).
  const metrics = enabled ? (serverMetrics ?? EMPTY_METRICS) : computeInvoiceMetrics(localItems);

  return { metrics, refresh };
}
