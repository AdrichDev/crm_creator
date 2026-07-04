// Unit tests puros del mapeo estado → métricas (crm-paridad-facturas-pedidos-aa, Fase 1.3).
// Runner: node --import tsx --test. Sin BD, sin mocks: función pura sobre arrays en memoria.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeInvoiceMetrics, INVOICE_ESTADOS, type InvoiceForMetrics } from '../metrics.js';

describe('computeInvoiceMetrics', () => {
  test('lista vacía → todas las métricas en cero', () => {
    const m = computeInvoiceMetrics([]);
    assert.deepEqual(m, {
      totalFacturas: 0,
      importeTotal: 0,
      pendientes: 0,
      importePendiente: 0,
      pagadas: 0,
      importePagado: 0,
      anuladas: 0,
      importeAnulado: 0,
    });
  });

  test('cuenta e importa cada estado por separado', () => {
    const invoices: InvoiceForMetrics[] = [
      { estado: 'Pendiente', total: 100 },
      { estado: 'Pendiente', total: 50 },
      { estado: 'Pagada', total: 200 },
      { estado: 'Anulada', total: 30 },
    ];
    const m = computeInvoiceMetrics(invoices);
    assert.equal(m.pendientes, 2);
    assert.equal(m.importePendiente, 150);
    assert.equal(m.pagadas, 1);
    assert.equal(m.importePagado, 200);
    assert.equal(m.anuladas, 1);
    assert.equal(m.importeAnulado, 30);
  });

  test('importeTotal suma TODAS las facturas, incluidas las Anuladas (mismo criterio que el front hoy)', () => {
    const invoices: InvoiceForMetrics[] = [
      { estado: 'Pendiente', total: 10 },
      { estado: 'Anulada', total: 90 },
    ];
    const m = computeInvoiceMetrics(invoices);
    assert.equal(m.totalFacturas, 2);
    assert.equal(m.importeTotal, 100);
  });

  test('un estado fuera de los 3 literales conocidos cuenta en el total pero en ningún contador de estado', () => {
    const invoices: InvoiceForMetrics[] = [
      { estado: 'Pendiente', total: 10 },
      { estado: 'Borrador', total: 40 }, // estado libre, no es un literal conocido
    ];
    const m = computeInvoiceMetrics(invoices);
    assert.equal(m.totalFacturas, 2);
    assert.equal(m.importeTotal, 50);
    assert.equal(m.pendientes, 1);
    assert.equal(m.pagadas, 0);
    assert.equal(m.anuladas, 0);
  });

  test('total no finito (NaN/Infinity) se trata como 0, no rompe la suma', () => {
    const invoices: InvoiceForMetrics[] = [
      { estado: 'Pagada', total: Number.NaN },
      { estado: 'Pagada', total: 20 },
    ];
    const m = computeInvoiceMetrics(invoices);
    assert.equal(m.pagadas, 2);
    assert.equal(m.importePagado, 20);
    assert.equal(m.importeTotal, 20);
  });

  test('INVOICE_ESTADOS expone exactamente los 3 literales usados por el front (FIELDS.estado.options)', () => {
    assert.deepEqual(INVOICE_ESTADOS, ['Pendiente', 'Pagada', 'Anulada']);
  });
});
