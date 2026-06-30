// Unit tests de parsePagination. Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination } from '../pagination.js';

describe('parsePagination — defaults', () => {
  test('sin parámetros → page 1, limit 20, search ""', () => {
    assert.deepEqual(parsePagination({}), { page: 1, limit: 20, search: '' });
  });

  test('page=2, limit=10, search="ana" → valores correctos', () => {
    assert.deepEqual(parsePagination({ page: '2', limit: '10', search: 'ana' }), {
      page: 2, limit: 10, search: 'ana',
    });
  });
});

describe('parsePagination — page defensivo', () => {
  test('page=-1 → normaliza a 1', () => {
    assert.equal(parsePagination({ page: '-1' }).page, 1);
  });

  test('page=0 → normaliza a 1', () => {
    assert.equal(parsePagination({ page: '0' }).page, 1);
  });

  test('page="abc" → normaliza a 1', () => {
    assert.equal(parsePagination({ page: 'abc' }).page, 1);
  });

  test('page="" → normaliza a 1', () => {
    assert.equal(parsePagination({ page: '' }).page, 1);
  });
});

describe('parsePagination — limit defensivo', () => {
  test('limit=150 → tope máximo 100', () => {
    assert.equal(parsePagination({ limit: '150' }).limit, 100);
  });

  test('limit=100 → exactamente 100', () => {
    assert.equal(parsePagination({ limit: '100' }).limit, 100);
  });

  test('limit=0 → parseInt=0 (falsy) → cae al default 20', () => {
    // 0 es falsy: parseInt('0') || 20 → 20, igual que si no se pasa limit.
    assert.equal(parsePagination({ limit: '0' }).limit, 20);
  });

  test('limit=-5 → normaliza a 1', () => {
    assert.equal(parsePagination({ limit: '-5' }).limit, 1);
  });

  test('limit="abc" → normaliza a 20 (default)', () => {
    assert.equal(parsePagination({ limit: 'abc' }).limit, 20);
  });

  test('limit=1 → exactamente 1', () => {
    assert.equal(parsePagination({ limit: '1' }).limit, 1);
  });
});

describe('parsePagination — search', () => {
  test('search=" mar " → trim → "mar"', () => {
    assert.equal(parsePagination({ search: ' mar ' }).search, 'mar');
  });

  test('search="" → cadena vacía', () => {
    assert.equal(parsePagination({ search: '' }).search, '');
  });

  test('sin search → cadena vacía', () => {
    assert.equal(parsePagination({}).search, '');
  });
});
