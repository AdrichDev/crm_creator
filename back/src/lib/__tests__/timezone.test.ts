// Unit tests para lib/timezone.ts (conversión de zona horaria en el borde con Google).
// Runner: node --import tsx --test. Sin red ni dependencias.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instantToWallClockUtc, wallClockUtcToNaive } from '../timezone.js';

describe('instantToWallClockUtc', () => {
  test('verano Madrid (+02:00): instante 08:00Z → wall-clock 10:00 como UTC', () => {
    const out = instantToWallClockUtc(new Date('2026-07-10T08:00:00.000Z'), 'Europe/Madrid');
    assert.equal(out.toISOString(), '2026-07-10T10:00:00.000Z');
  });

  test('invierno Madrid (+01:00): instante 09:00Z → wall-clock 10:00 como UTC', () => {
    const out = instantToWallClockUtc(new Date('2026-01-10T09:00:00.000Z'), 'Europe/Madrid');
    assert.equal(out.toISOString(), '2026-01-10T10:00:00.000Z');
  });

  test('input con offset explícito (formato real de Google) se normaliza igual', () => {
    // 2026-07-10T11:00:00+02:00 === instante 09:00Z; wall-clock Madrid = 11:00.
    const out = instantToWallClockUtc(new Date('2026-07-10T11:00:00+02:00'), 'Europe/Madrid');
    assert.equal(out.toISOString(), '2026-07-10T11:00:00.000Z');
  });

  test('tz UTC → identidad (sin desplazamiento)', () => {
    const out = instantToWallClockUtc(new Date('2026-07-10T09:00:00.000Z'), 'UTC');
    assert.equal(out.toISOString(), '2026-07-10T09:00:00.000Z');
  });

  test('cruce de día: 23:30Z verano Madrid → 01:30 del día siguiente', () => {
    const out = instantToWallClockUtc(new Date('2026-07-10T23:30:00.000Z'), 'Europe/Madrid');
    assert.equal(out.toISOString(), '2026-07-11T01:30:00.000Z');
  });
});

describe('wallClockUtcToNaive', () => {
  test('quita el sufijo Z y milisegundos → dateTime naive para Google', () => {
    assert.equal(wallClockUtcToNaive(new Date('2026-07-10T10:00:00.000Z')), '2026-07-10T10:00:00');
  });

  test('preserva la hora de pared tal cual (sin conversión)', () => {
    assert.equal(wallClockUtcToNaive(new Date('2026-01-10T09:30:00.000Z')), '2026-01-10T09:30:00');
  });
});
