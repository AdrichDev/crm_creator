// crm-paridad-facturas-pedidos-aa (fix post-PR-4): métricas puras de pedidos — FALLBACK
// SOLO para el modo local/demo.
//
// En modo API los KPIs de `/pedidos` ya NO se calculan aquí — vienen del back
// (`GET /pedidos` → `metrics`, sobre TODOS los pedidos del negocio), porque el listado del
// front está paginado y calcular sobre una página subcontaba (mismo bug que Facturas,
// arreglado igual que en PR-3). En local/demo `localBackend.list()` devuelve el array
// COMPLETO, sin paginación → el cálculo cliente es correcto por construcción. La consume
// `front/lib/data/use-pedido-metrics.ts`.
//
// Espejo EXACTO (mismo nombre, misma interfaz, mismos criterios) de
// `back/src/lib/pedidos/metrics.ts`. Se replica en el front en vez de importarse porque
// front y back son paquetes separados (el front NUNCA importa de back — misma convención
// que `front/lib/invoices/metrics.ts`). Cualquier cambio de criterio va en AMBAS copias.
//
// Criterios (idénticos al cálculo inline que vivía antes en la página):
//   - `totalPedidos` cuenta TODOS los pedidos, sin importar el estado.
//   - `aceptados` cuenta por igualdad exacta `estado === 'aceptada'`.
//   - `importeTotal` suma `totalImpl` de TODOS los pedidos, sin filtrar por estado.
//   - Un `totalImpl` no finito (NaN/Infinity) cuenta como 0 (guard defensivo).

/** Forma mínima de entrada: solo lo que la métrica necesita de un pedido. */
export interface PedidoForMetrics {
  estado: string;
  /** Total de pago único (implantación) con IVA — lo que la página suma como "Importe". */
  totalImpl: number;
}

export interface PedidoMetrics {
  /** Nº total de pedidos (todos los estados). */
  totalPedidos: number;
  /** Pedidos con estado exactamente 'aceptada'. */
  aceptados: number;
  /** Suma de `totalImpl` de TODOS los pedidos, sin filtrar por estado. */
  importeTotal: number;
}

/**
 * Deriva las métricas de un listado de pedidos. Pura: sin I/O ni relojes, determinista
 * para la misma entrada. `totalImpl` se toma tal cual: el caller ya debe pasar
 * `Number(pedido.totalImpl)` (en JSON del back es string de Decimal, en mock es number).
 */
export function computePedidoMetrics(pedidos: PedidoForMetrics[]): PedidoMetrics {
  const metrics: PedidoMetrics = { totalPedidos: 0, aceptados: 0, importeTotal: 0 };
  for (const p of pedidos) {
    metrics.totalPedidos += 1;
    metrics.importeTotal += Number.isFinite(p.totalImpl) ? p.totalImpl : 0;
    if (p.estado === 'aceptada') metrics.aceptados += 1;
  }
  return metrics;
}
