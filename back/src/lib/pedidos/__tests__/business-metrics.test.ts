// Unit tests de computeBusinessPedidoMetrics (crm-paridad-facturas-pedidos-aa, fix post-PR-4).
// Runner: node --import tsx --test (incluido en `npm test`, sin BD real: delegate falso).
//
// Prueban el NÚCLEO del fix (mismo bug que Facturas en PR-3): las métricas se calculan
// sobre el conjunto COMPLETO de pedidos del negocio, ignorando la paginación del listado
// (skip/take). Antes el front las derivaba sobre una sola página de GET /pedidos (default
// 20) → subconteo silencioso de los KPIs en negocios con muchos pedidos.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeBusinessPedidoMetrics, type PedidoMetricsDelegate } from '../metrics.js';

// Delegate falso: simula prisma.pedido.findMany. Registra los args recibidos y devuelve
// SIEMPRE el conjunto completo de filas (como un findMany sin skip/take).
function fakeDelegate(rows: Array<{ estado: string; totalImpl: unknown }>) {
  const calls: Array<Record<string, unknown>> = [];
  const delegate: PedidoMetricsDelegate = {
    async findMany(args) {
      calls.push(args as unknown as Record<string, unknown>);
      return rows;
    },
  };
  return { delegate, calls };
}

describe('computeBusinessPedidoMetrics', () => {
  test('las métricas reflejan TODOS los pedidos del negocio aunque superen el page size (fix subconteo)', async () => {
    // 57 pedidos: MÁS que el page size por defecto de parsePagination (20). El listado
    // paginado solo devolvería 20; las métricas deben contar los 57 igualmente.
    const rows = [
      ...Array.from({ length: 30 }, () => ({ estado: 'generada', totalImpl: 100 })),
      ...Array.from({ length: 20 }, () => ({ estado: 'aceptada', totalImpl: 200 })),
      ...Array.from({ length: 7 }, () => ({ estado: 'rechazada', totalImpl: 50 })),
    ];
    const { delegate } = fakeDelegate(rows);

    const m = await computeBusinessPedidoMetrics(delegate, 'biz_1');

    assert.equal(m.totalPedidos, 57, 'cuenta los 57, no solo una página de 20');
    assert.equal(m.aceptados, 20);
    assert.equal(m.importeTotal, 30 * 100 + 20 * 200 + 7 * 50); // 3000 + 4000 + 350 = 7350
  });

  test('la query de métricas escopa por businessId + eliminadoEn:null y NO aplica skip/take', async () => {
    const { delegate, calls } = fakeDelegate([{ estado: 'aceptada', totalImpl: 10 }]);

    await computeBusinessPedidoMetrics(delegate, 'biz_42');

    assert.equal(calls.length, 1);
    const args = calls[0];
    assert.deepEqual(args.where, { businessId: 'biz_42', eliminadoEn: null });
    // Clave del fix: sin paginación en la query de métricas.
    assert.equal('skip' in args, false, 'la métrica NO debe paginar');
    assert.equal('take' in args, false, 'la métrica NO debe paginar');
    // Solo selecciona lo necesario (estado + totalImpl).
    assert.deepEqual(args.select, { estado: true, totalImpl: true });
  });

  test('normaliza totalImpl Decimal (string) vía Number(...) antes de sumar', async () => {
    // En BD `totalImpl` es Decimal; Prisma lo entrega como Decimal (aquí simulado con string).
    const { delegate } = fakeDelegate([
      { estado: 'aceptada', totalImpl: '120.50' },
      { estado: 'generada', totalImpl: '30' },
    ]);

    const m = await computeBusinessPedidoMetrics(delegate, 'biz_1');

    assert.equal(m.importeTotal, 150.5);
    assert.equal(m.aceptados, 1);
  });

  test('negocio sin pedidos → todas las métricas en cero', async () => {
    const { delegate } = fakeDelegate([]);
    const m = await computeBusinessPedidoMetrics(delegate, 'biz_empty');
    assert.deepEqual(m, { totalPedidos: 0, aceptados: 0, importeTotal: 0 });
  });
});
