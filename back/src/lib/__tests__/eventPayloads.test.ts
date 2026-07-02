// Unit tests para eventPayloads.ts (constructores de payload de review/timeoff).
// Runner: node --import tsx --test
//
// Cubre 4.3 (review.request en COMPLETED) y 5.1 (timeoff ida/vuelta): el mapeo
// de datos de dominio → payload del evento. Las rutas emiten estos payloads con
// emit() (soft-fail); aquí se verifica el contrato de datos.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReviewRequest,
  buildTimeoffRequested,
  buildTimeoffResolved,
} from '../eventPayloads.js';

// ---------------------------------------------------------------------------
// 4.3 — review.request
// ---------------------------------------------------------------------------
describe('buildReviewRequest', () => {
  test('mapea cliente, servicio y formatea fecha/hora', () => {
    const p = buildReviewRequest({
      businessName: 'Peluquería Test',
      customer: { nombre: 'Ana', apellido: 'García' },
      email: 'ana@test.com',
      serviceName: 'Corte de cabello',
      startAt: new Date('2026-07-10T10:30:00Z'),
    });
    assert.equal(p.businessName, 'Peluquería Test');
    assert.equal(p.customerName, 'Ana García');
    assert.equal(p.email, 'ana@test.com');
    assert.equal(p.serviceName, 'Corte de cabello');
    assert.ok(typeof p.fecha === 'string' && p.fecha.length > 0);
    assert.ok(typeof p.hora === 'string' && p.hora.length > 0);
  });

  test('cliente sin apellido → nombre solo, no rompe', () => {
    const p = buildReviewRequest({
      businessName: 'X', customer: { nombre: 'Luis', apellido: null },
      email: 'l@test.com', serviceName: 'Masaje', startAt: new Date('2026-07-10T10:00:00Z'),
    });
    assert.ok(p.customerName.includes('Luis'));
  });
});

// ---------------------------------------------------------------------------
// 5.1 — timeoff.requested (ida) y timeoff.resolved (vuelta)
// ---------------------------------------------------------------------------
describe('buildTimeoffRequested', () => {
  test('mapea empleado, tipo y fechas ISO; dias null → 0', () => {
    const p = buildTimeoffRequested({
      businessName: 'Negocio Test',
      email: 'admin@test.com',
      employee: { nombre: 'Miguel', apellido: 'Torres' },
      tipoLabel: 'Vacaciones',
      inicio: new Date('2026-08-01T00:00:00Z'),
      fin: new Date('2026-08-10T00:00:00Z'),
      dias: null,
    });
    assert.equal(p.email, 'admin@test.com');
    assert.equal(p.employeeName, 'Miguel Torres');
    assert.equal(p.tipo, 'Vacaciones');
    assert.equal(p.inicio, '2026-08-01');
    assert.equal(p.fin, '2026-08-10');
    assert.equal(p.dias, 0);
  });

  test('empleado null → etiqueta genérica', () => {
    const p = buildTimeoffRequested({
      businessName: 'X', email: 'a@test.com', employee: null, tipoLabel: 'Baja',
      inicio: new Date('2026-08-01T00:00:00Z'), fin: new Date('2026-08-02T00:00:00Z'), dias: 1,
    });
    assert.equal(p.employeeName, 'Empleado');
    assert.equal(p.dias, 1);
  });
});

describe('buildTimeoffResolved', () => {
  test('mapea estado, empleado y email destino', () => {
    const p = buildTimeoffResolved({
      businessName: 'Negocio Test',
      employee: { nombre: 'Miguel', apellido: 'Torres' },
      email: 'miguel@test.com',
      estadoLabel: 'Aprobada',
      inicio: new Date('2026-08-01T00:00:00Z'),
      fin: new Date('2026-08-10T00:00:00Z'),
    });
    assert.equal(p.employeeName, 'Miguel Torres');
    assert.equal(p.email, 'miguel@test.com');
    assert.equal(p.estado, 'Aprobada');
    assert.equal(p.inicio, '2026-08-01');
    assert.equal(p.fin, '2026-08-10');
  });
});
