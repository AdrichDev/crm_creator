// crm-paridad-facturas-pedidos-aa (Fase 1.2 / PR-2): cálculo server-side de totales
// de un Pedido/Presupuesto documental.
//
// Espejo de `computeBudgetTotals` de agents-agency (back/src/lib/budgets.ts): los
// totales NUNCA se confían al cliente, se computan a partir de las líneas. Igual que en
// AA, cada línea tiene un precio de pago único (impl) y uno mensual (mant); el IVA se
// aplica sobre cada subtotal. Función pura: sin I/O, sin relojes, determinista.

export interface PedidoLineInput {
  cantidad?: number;
  precioImpl?: number;
  precioMant?: number;
}

export interface PedidoTotals {
  subtotalImpl: number;
  subtotalMant: number;
  totalImpl: number;
  totalMant: number;
}

/** Redondea a 2 decimales evitando errores de coma flotante (igual que AA). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula subtotales (sin IVA) y totales (con IVA) a partir de las líneas.
 * `tasaIva` es una fracción (p. ej. 0.21 para 21%). Valores no finitos en cantidad,
 * precios o tasa se tratan como 1 (cantidad) o 0 (resto), sin propagar NaN.
 */
export function computePedidoTotals(
  lines: PedidoLineInput[],
  tasaIva: number
): PedidoTotals {
  let subtotalImpl = 0;
  let subtotalMant = 0;

  for (const l of lines) {
    const qty = Number.isFinite(l.cantidad) ? Number(l.cantidad) : 1;
    const impl = Number.isFinite(l.precioImpl) ? Number(l.precioImpl) : 0;
    const mant = Number.isFinite(l.precioMant) ? Number(l.precioMant) : 0;
    subtotalImpl += qty * impl;
    subtotalMant += qty * mant;
  }

  const rate = Number.isFinite(tasaIva) ? tasaIva : 0;

  return {
    subtotalImpl: round2(subtotalImpl),
    subtotalMant: round2(subtotalMant),
    totalImpl: round2(subtotalImpl * (1 + rate)),
    totalMant: round2(subtotalMant * (1 + rate)),
  };
}
