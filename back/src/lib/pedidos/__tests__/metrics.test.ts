// Unit tests de computePedidoMetrics (crm-paridad-facturas-pedidos-aa, fix post-PR-4).
// Runner: node --import tsx --test (incluido en `npm test`, sin BD real).
//
// Fija los criterios de los 3 KPIs que la pantalla /pedidos ya mostraba (sin inventar
// métricas nuevas): total, aceptados (igualdad exacta de estado) e importe = suma de
// totalImpl de TODOS los pedidos sin filtrar por estado. Espejo del test de PR-3 para
// computeInvoiceMetrics.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computePedidoMetrics } from '../metrics.js';

describe('computePedidoMetrics', () => {
  test('lista vacía → todo a cero', () => {
    assert.deepEqual(computePedidoMetrics([]), { totalPedidos: 0, aceptados: 0, importeTotal: 0 });
  });

  test('cuenta aceptados por igualdad exacta y suma totalImpl de TODOS los estados', () => {
    const m = computePedidoMetrics([
      { estado: 'generada', totalImpl: 1452 },
      { estado: 'aceptada', totalImpl: 1028.5 },
      { estado: 'aceptada', totalImpl: 100 },
      { estado: 'rechazada', totalImpl: 50 },
      { estado: 'caducada', totalImpl: 25 },
    ]);
    assert.equal(m.totalPedidos, 5);
    assert.equal(m.aceptados, 2);
    // Incluye rechazadas y caducadas: mismo criterio que el reduce del front.
    assert.equal(m.importeTotal, 1452 + 1028.5 + 100 + 50 + 25);
  });

  test('estado libre fuera del ciclo cuenta en el total pero no en aceptados', () => {
    const m = computePedidoMetrics([{ estado: 'borrador', totalImpl: 30 }]);
    assert.equal(m.totalPedidos, 1);
    assert.equal(m.aceptados, 0);
    assert.equal(m.importeTotal, 30);
  });

  test('totalImpl no finito (NaN/Infinity) cuenta como 0', () => {
    const m = computePedidoMetrics([
      { estado: 'aceptada', totalImpl: Number.NaN },
      { estado: 'generada', totalImpl: Number.POSITIVE_INFINITY },
      { estado: 'generada', totalImpl: 50 },
    ]);
    assert.equal(m.totalPedidos, 3);
    assert.equal(m.aceptados, 1);
    assert.equal(m.importeTotal, 50);
  });
});
