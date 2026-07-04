// crm-paridad-facturas-pedidos-aa (fix post-PR-4): métricas de pedidos SERVER-SIDE.
//
// Mismo bug y mismo fix que PR-3 en Facturas (back/src/lib/invoices/metrics.ts):
// `GET /pedidos` pagina el listado (skip/take vía parsePagination, default 20), pero la
// pantalla `/pedidos` derivaba sus KPIs en el front sobre `items` (UNA página). Un negocio
// con más pedidos que el page size veía "Pedidos"/"Aceptados"/"Importe" subcontados sin
// ningún aviso visual. Aquí se calcula sobre el conjunto COMPLETO no eliminado del negocio.
//
// Las métricas replican EXACTAMENTE los 3 KPIs que la página ya mostraba (no se inventan
// nuevas): total de pedidos, aceptados (estado === 'aceptada', igualdad exacta como el
// `items.filter` del front) e importe total = suma de `totalImpl` de TODOS los pedidos,
// sin filtrar por estado (así se comportaba el `items.reduce` del front).

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
 * para la misma entrada. `totalImpl` se toma tal cual (el caller ya debe pasar
 * `Number(pedido.totalImpl)`, dado que en BD es un Decimal). Igual que en Facturas,
 * un `totalImpl` no finito (NaN/Infinity) cuenta como 0 (guard defensivo).
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

/**
 * Delegate mínimo (subconjunto de `PrismaClient.pedido`) que necesita la métrica
 * server-side: solo un `findMany` que devuelva `estado` + `totalImpl`.
 */
export interface PedidoMetricsDelegate {
  findMany(args: {
    where: { businessId: string | undefined; eliminadoEn: null };
    select: { estado: true; totalImpl: true };
  }): Promise<Array<{ estado: string; totalImpl: unknown }>>;
}

/**
 * Calcula las métricas sobre TODOS los pedidos no eliminados del negocio (el conjunto
 * COMPLETO, no solo la página devuelta por el listado): `findMany` APARTE, SIN `skip`/`take`,
 * con el mismo scoping por `businessId` + `eliminadoEn: null` que el listado. Nótese que
 * tampoco aplica el filtro `search` del listado: los KPIs son del negocio, no de la búsqueda.
 *
 * `totalImpl` es un `Decimal` en BD → se normaliza con `Number(...)` antes de delegar en
 * `computePedidoMetrics` (mismo criterio que el front hacía con `Number(p.totalImpl)`).
 */
export async function computeBusinessPedidoMetrics(
  delegate: PedidoMetricsDelegate,
  businessId: string | undefined,
): Promise<PedidoMetrics> {
  const rows = await delegate.findMany({
    where: { businessId, eliminadoEn: null },
    select: { estado: true, totalImpl: true },
  });
  return computePedidoMetrics(rows.map((r) => ({ estado: r.estado, totalImpl: Number(r.totalImpl) })));
}
