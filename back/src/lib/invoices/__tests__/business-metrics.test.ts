// Unit tests de computeBusinessInvoiceMetrics (crm-paridad-facturas-pedidos-aa, PR-3).
// Runner: node --import tsx --test (incluido en `npm test`, sin BD real: delegate falso).
//
// Prueban el NÚCLEO del fix: las métricas se calculan sobre el conjunto COMPLETO de facturas
// del negocio, ignorando la paginación del listado (skip/take). Antes el front las derivaba
// sobre una sola página → subconteo silencioso en negocios con muchas facturas.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeBusinessInvoiceMetrics, type InvoiceMetricsDelegate } from '../metrics.js';

// Delegate falso: simula prisma.invoice.findMany. Registra los args recibidos y devuelve
// SIEMPRE el conjunto completo de filas (así es como se comporta un findMany sin skip/take).
function fakeDelegate(rows: Array<{ estado: string; total: unknown }>) {
  const calls: Array<Record<string, unknown>> = [];
  const delegate: InvoiceMetricsDelegate = {
    async findMany(args) {
      calls.push(args as unknown as Record<string, unknown>);
      return rows;
    },
  };
  return { delegate, calls };
}

describe('computeBusinessInvoiceMetrics', () => {
  test('las métricas reflejan TODAS las facturas del negocio aunque superen el page size (fix subconteo)', async () => {
    // 57 facturas: MÁS que el page size por defecto (20) y que el tope (100 no, pero 57 > 20
    // basta para reproducir el bug). El listado paginado solo devolvería 20; las métricas NO.
    const rows = [
      ...Array.from({ length: 30 }, () => ({ estado: 'Pendiente', total: 100 })),
      ...Array.from({ length: 20 }, () => ({ estado: 'Pagada', total: 200 })),
      ...Array.from({ length: 7 }, () => ({ estado: 'Anulada', total: 50 })),
    ];
    const { delegate } = fakeDelegate(rows);

    const m = await computeBusinessInvoiceMetrics(delegate, 'biz_1');

    assert.equal(m.totalFacturas, 57, 'cuenta las 57, no solo una página de 20');
    assert.equal(m.importeTotal, 30 * 100 + 20 * 200 + 7 * 50); // 3000 + 4000 + 350 = 7350
    assert.equal(m.pendientes, 30);
    assert.equal(m.importePendiente, 3000);
    assert.equal(m.pagadas, 20);
    assert.equal(m.importePagado, 4000);
    assert.equal(m.anuladas, 7);
    assert.equal(m.importeAnulado, 350);
  });

  test('la query de métricas escopa por businessId + eliminadoEn:null y NO aplica skip/take', async () => {
    const { delegate, calls } = fakeDelegate([{ estado: 'Pagada', total: 10 }]);

    await computeBusinessInvoiceMetrics(delegate, 'biz_42');

    assert.equal(calls.length, 1);
    const args = calls[0];
    assert.deepEqual(args.where, { businessId: 'biz_42', eliminadoEn: null });
    // Clave del fix: sin paginación en la query de métricas.
    assert.equal('skip' in args, false, 'la métrica NO debe paginar');
    assert.equal('take' in args, false, 'la métrica NO debe paginar');
    // Solo selecciona lo necesario (estado + total).
    assert.deepEqual(args.select, { estado: true, total: true });
  });

  test('normaliza total Decimal (string/objeto) vía Number(...) antes de sumar', async () => {
    // En BD `total` es Decimal; Prisma lo entrega como Decimal (aquí simulado con string).
    const { delegate } = fakeDelegate([
      { estado: 'Pagada', total: '120.50' },
      { estado: 'Pendiente', total: '30' },
    ]);

    const m = await computeBusinessInvoiceMetrics(delegate, 'biz_1');

    assert.equal(m.importeTotal, 150.5);
    assert.equal(m.importePagado, 120.5);
    assert.equal(m.importePendiente, 30);
  });

  test('negocio sin facturas → todas las métricas en cero', async () => {
    const { delegate } = fakeDelegate([]);
    const m = await computeBusinessInvoiceMetrics(delegate, 'biz_empty');
    assert.equal(m.totalFacturas, 0);
    assert.equal(m.importeTotal, 0);
  });
});
