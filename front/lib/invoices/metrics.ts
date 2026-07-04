// crm-paridad-facturas-pedidos-aa (Fase 2): mapeo puro estado → métricas de facturas.
//
// PR-3: en modo API los KPIs de `Facturas` ya NO se calculan aquí — vienen del back
// (`GET /invoices` → `metrics`, sobre TODAS las facturas del negocio), porque el listado del
// front está paginado y calcular sobre una página subcontaba. Esta función se conserva como
// FALLBACK SOLO para el modo local/demo (`localBackend.list()` devuelve el array completo, sin
// paginación → cálculo cliente correcto). La consume `front/lib/data/use-invoice-metrics.ts`.
//
// Espejo EXACTO (mismo nombre, misma interfaz, mismos criterios) de la función pura de
// PR-1 `back/src/lib/invoices/metrics.ts`. Se replica en el front en vez de importarse
// porque `front` y `back` son paquetes separados (sin workspace ni módulo compartido: el
// front NUNCA importa de back — misma convención con la que `Factura` de lib/mock/data.ts
// refleja `crm.factura`). Cualquier cambio de criterio debe aplicarse en AMBAS copias.
//
// Criterios (idénticos a PR-1 y al cálculo inline que vivía antes en la página):
//   - `importeTotal` suma TODAS las facturas, sin importar el estado (incluidas Anuladas).
//   - `pendientes`/`pagadas`/`anuladas` cuentan por igualdad exacta de `estado`.
//   - `estado` es un String libre en BD: un valor fuera de los 3 literales conocidos suma
//     a `totalFacturas`/`importeTotal` pero no incrementa ningún contador de estado.
//   - Un `total` no finito (NaN/Infinity) cuenta como 0 (guard defensivo).

/** Los 3 literales de estado usados por el front (FIELDS estado.options). */
export const INVOICE_ESTADOS = ['Pendiente', 'Pagada', 'Anulada'] as const;
export type InvoiceEstado = (typeof INVOICE_ESTADOS)[number];

/** Forma mínima de entrada: solo lo que la métrica necesita de una factura. */
export interface InvoiceForMetrics {
  estado: string;
  total: number;
}

export interface InvoiceMetrics {
  /** Nº total de facturas (todos los estados, incluidas Anuladas). */
  totalFacturas: number;
  /** Suma de `total` de TODAS las facturas, sin filtrar por estado. */
  importeTotal: number;
  pendientes: number;
  importePendiente: number;
  pagadas: number;
  importePagado: number;
  anuladas: number;
  importeAnulado: number;
}

/**
 * Deriva las métricas documentales de un listado de facturas. Pura: sin I/O ni relojes,
 * determinista para la misma entrada. `total` se toma tal cual: el caller ya debe pasar
 * `Number(factura.total)` (en BD es un Decimal, en mock es number).
 */
export function computeInvoiceMetrics(invoices: InvoiceForMetrics[]): InvoiceMetrics {
  const metrics: InvoiceMetrics = {
    totalFacturas: 0,
    importeTotal: 0,
    pendientes: 0,
    importePendiente: 0,
    pagadas: 0,
    importePagado: 0,
    anuladas: 0,
    importeAnulado: 0,
  };

  for (const inv of invoices) {
    const total = Number.isFinite(inv.total) ? inv.total : 0;
    metrics.totalFacturas += 1;
    metrics.importeTotal += total;

    switch (inv.estado) {
      case 'Pendiente':
        metrics.pendientes += 1;
        metrics.importePendiente += total;
        break;
      case 'Pagada':
        metrics.pagadas += 1;
        metrics.importePagado += total;
        break;
      case 'Anulada':
        metrics.anuladas += 1;
        metrics.importeAnulado += total;
        break;
      default:
        break;
    }
  }

  return metrics;
}
