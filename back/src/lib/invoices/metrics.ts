// crm-paridad-facturas-pedidos-aa (Fase 1.3): mapeo puro estado → métricas de facturas.
//
// Extrae a función pura la lógica que YA vive hoy en
// `front/app/(crm)/facturas/page.tsx` (Stat "Facturas"/"Importe total"/"Pendientes"),
// para poder reutilizarla desde el backend en la futura vista documental (Fase 2)
// sin duplicar el cálculo ni cambiar su comportamiento actual:
//   - `importeTotal` suma TODAS las facturas, sin importar el estado (incluidas
//     las Anuladas) — así se comporta hoy el "Importe total" del front.
//   - `pendientes`/`pagadas`/`anuladas` cuentan por igualdad exacta de `estado`
//     (mismo criterio que el filtro `items.filter(f => f.estado === 'Pendiente')`
//     del front).
// `estado` en el modelo Prisma es un `String` libre (no un enum), así que un
// valor fuera de los 3 literales conocidos suma a `totalFacturas`/`importeTotal`
// pero no incrementa ningún contador de estado — igual que hoy (una comparación
// estricta que simplemente no matchea).

/** Los 3 literales de estado usados hoy por el front (FIELDS estado.options). */
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
 * Deriva las métricas documentales de un listado de facturas. Pura: sin I/O,
 * sin fechas/relojes, determinista para la misma entrada. `total` se toma tal
 * cual (el caller ya debe pasar `Number(factura.total)`, dado que en BD es un
 * `Decimal` — igual que hace hoy el front con `Number(f.total)`).
 *
 * Diverge del front en un punto: aquí un `total` no finito (`NaN`/`Infinity`)
 * cuenta como 0; el front de hoy no tiene ese guard y arrastraría `NaN` en la
 * suma. Inofensivo mientras `total` sea siempre un Decimal válido en BD, pero
 * no asumir que esta función es un espejo exacto del front en ese caso límite.
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
        // Estado libre fuera de los 3 literales conocidos: cuenta en el total
        // (arriba) pero no en ningún contador de estado — mismo comportamiento
        // que el filtro exacto `f.estado === 'Pendiente'` del front hoy.
        break;
    }
  }

  return metrics;
}

/**
 * Delegate mínimo (subconjunto de `PrismaClient.invoice`) que necesita la métrica
 * server-side: solo un `findMany` que devuelva `estado` + `total`.
 */
export interface InvoiceMetricsDelegate {
  findMany(args: {
    where: { businessId: string | undefined; eliminadoEn: null };
    select: { estado: true; total: true };
  }): Promise<Array<{ estado: string; total: unknown }>>;
}

/**
 * Calcula las métricas documentales sobre TODAS las facturas no eliminadas del negocio
 * (el conjunto COMPLETO, no solo la página devuelta por el listado).
 *
 * Este es el núcleo del fix de PR-3: `GET /invoices` pagina el listado (`skip`/`take`, tope
 * de 100 por página vía `parsePagination`), pero las métricas se calculaban antes en el
 * front sobre esa página. Un negocio con más facturas que el page size veía los KPIs
 * subcontados sin ningún aviso visual. Aquí se hace un `findMany` APARTE, SIN `skip`/`take`,
 * con el mismo scoping por `businessId` + `eliminadoEn: null` que el listado. Paridad con AA
 * (`agents-agency/back/src/routes/invoices.ts`, que devuelve `{ invoices, metrics }`).
 *
 * `total` es un `Decimal` en BD → se normaliza con `Number(...)` (mismo criterio que el
 * front hacía con `Number(f.total)`) antes de delegar en `computeInvoiceMetrics`.
 */
export async function computeBusinessInvoiceMetrics(
  delegate: InvoiceMetricsDelegate,
  businessId: string | undefined,
): Promise<InvoiceMetrics> {
  const rows = await delegate.findMany({
    where: { businessId, eliminadoEn: null },
    select: { estado: true, total: true },
  });
  return computeInvoiceMetrics(rows.map((r) => ({ estado: r.estado, total: Number(r.total) })));
}
