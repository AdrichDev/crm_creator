// Unit tests puros de computePedidoTotals (crm-paridad-facturas-pedidos-aa, Fase 1.2 / PR-2).
// Runner: node --import tsx --test. Sin BD, sin mocks: función pura sobre arrays en memoria.
// Fija la paridad con computeBudgetTotals de AA (subtotales sin IVA + totales con IVA por
// pago único / mensual, cálculo SIEMPRE server-side desde las líneas).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computePedidoTotals, type PedidoLineInput } from '../totals.js';

describe('computePedidoTotals', () => {
  test('lista vacía → todos los totales en cero', () => {
    assert.deepEqual(computePedidoTotals([], 0.21), {
      subtotalImpl: 0,
      subtotalMant: 0,
      totalImpl: 0,
      totalMant: 0,
    });
  });

  test('subtotales = suma(cantidad × precio) por concepto; totales aplican el IVA', () => {
    const lines: PedidoLineInput[] = [
      { cantidad: 2, precioImpl: 100, precioMant: 10 },
      { cantidad: 1, precioImpl: 50, precioMant: 5 },
    ];
    const t = computePedidoTotals(lines, 0.21);
    assert.equal(t.subtotalImpl, 250); // 2*100 + 1*50
    assert.equal(t.subtotalMant, 25); //  2*10  + 1*5
    assert.equal(t.totalImpl, 302.5); // 250 * 1.21
    assert.equal(t.totalMant, 30.25); //  25 * 1.21
  });

  test('cantidad por defecto 1 cuando falta o no es finita', () => {
    const t = computePedidoTotals([{ precioImpl: 40, precioMant: 4 }], 0);
    assert.equal(t.subtotalImpl, 40);
    assert.equal(t.subtotalMant, 4);
    // tasa 0 → total == subtotal
    assert.equal(t.totalImpl, 40);
    assert.equal(t.totalMant, 4);
  });

  test('precios/tasa no finitos se tratan como 0 (no propaga NaN)', () => {
    const lines: PedidoLineInput[] = [
      { cantidad: 3, precioImpl: Number.NaN, precioMant: 2 },
    ];
    const t = computePedidoTotals(lines, Number.POSITIVE_INFINITY);
    assert.equal(t.subtotalImpl, 0); // precioImpl NaN → 0
    assert.equal(t.subtotalMant, 6); // 3 * 2
    assert.equal(t.totalImpl, 0); //   tasa no finita → 0
    assert.equal(t.totalMant, 6);
  });

  test('redondea a 2 decimales sin arrastrar error de coma flotante', () => {
    // 0.1 * 3 = 0.30000000000000004 en IEEE-754 → debe redondear a 0.3
    const t = computePedidoTotals([{ cantidad: 3, precioImpl: 0.1, precioMant: 0 }], 0);
    assert.equal(t.subtotalImpl, 0.3);
    assert.equal(t.totalImpl, 0.3);
  });
});
