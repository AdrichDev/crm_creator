// Unit tests de helpers de nombre. Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitNombre, joinNombre, pickFields } from '../nombre.js';

describe('splitNombre', () => {
  test('un solo token → apellido null', () => {
    assert.deepEqual(splitNombre('Ana'), { nombre: 'Ana', apellido: null });
  });
  test('nombre + apellidos → resto al apellido', () => {
    assert.deepEqual(splitNombre('Ana Pérez García'), { nombre: 'Ana', apellido: 'Pérez García' });
  });
  test('espacios sobrantes se normalizan', () => {
    assert.deepEqual(splitNombre('  Ana   Pérez  '), { nombre: 'Ana', apellido: 'Pérez' });
  });
  test('vacío → nombre vacío, apellido null', () => {
    assert.deepEqual(splitNombre('   '), { nombre: '', apellido: null });
  });
});

describe('joinNombre', () => {
  test('combina nombre + apellido', () => {
    assert.equal(joinNombre({ nombre: 'Ana', apellido: 'Pérez' }), 'Ana Pérez');
  });
  test('apellido null/undefined → solo nombre', () => {
    assert.equal(joinNombre({ nombre: 'Ana', apellido: null }), 'Ana');
    assert.equal(joinNombre({ nombre: 'Ana' }), 'Ana');
  });
  test('null/undefined → cadena vacía', () => {
    assert.equal(joinNombre(null), '');
    assert.equal(joinNombre(undefined), '');
  });
});

describe('pickFields', () => {
  test('solo copia campos presentes (no undefined)', () => {
    const out = pickFields({ a: 1, b: undefined, c: 'x', d: null }, ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(out, { a: 1, c: 'x', d: null });
  });
  test('lista vacía → objeto vacío', () => {
    assert.deepEqual(pickFields({ a: 1 }, []), {});
  });
});
