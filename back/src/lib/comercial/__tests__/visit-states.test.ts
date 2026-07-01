import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VISIT_STATES } from '../visit-states.js';

// Invariantes de los estados de visita base (WU1.5). No tocan DB: validan el catálogo
// sembrado por negocio. Los estados fijan color/icono del marcador y su condición de
// pendiente (separado de la categoría ABC).
describe('DEFAULT_VISIT_STATES', () => {
  test('hay exactamente 5 estados base', () => {
    assert.equal(DEFAULT_VISIT_STATES.length, 5);
  });

  test('el orden es único y consecutivo 0..4', () => {
    const ordenes = DEFAULT_VISIT_STATES.map((s) => s.orden).sort((a, b) => a - b);
    assert.deepEqual(ordenes, [0, 1, 2, 3, 4]);
    assert.equal(new Set(ordenes).size, 5);
  });

  test('los nombres son únicos y no vacíos', () => {
    const nombres = DEFAULT_VISIT_STATES.map((s) => s.nombre);
    assert.equal(new Set(nombres).size, nombres.length);
    for (const n of nombres) assert.ok(n.trim().length > 0);
  });

  test('cada color es un hex válido', () => {
    for (const s of DEFAULT_VISIT_STATES) {
      assert.match(s.color, /^#[0-9a-fA-F]{6}$/, `color inválido en ${s.nombre}`);
    }
  });

  test('los estados pendientes y cerrados están bien clasificados', () => {
    const pendientes = DEFAULT_VISIT_STATES.filter((s) => s.esPendiente).map((s) => s.nombre);
    const cerrados = DEFAULT_VISIT_STATES.filter((s) => !s.esPendiente).map((s) => s.nombre);
    // Pendiente/Seguimiento/Revisitar cuentan como pendientes; Visitado/Inactivo no.
    assert.deepEqual(pendientes.sort(), ['Pendiente de visitar', 'Revisitar', 'Seguimiento pendiente']);
    assert.deepEqual(cerrados.sort(), ['Inactivo', 'Visitado']);
  });
});
