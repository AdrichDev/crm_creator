// Unit tests del cache del resolver (crm-tenant-lifecycle-gate, WU2).
// Runner: node --import tsx --test
//
// BD como doble (DI) con contador de lecturas + reloj inyectado (`now`) para TTL determinista,
// sin timers reales ni migración aplicada. Cada describe usa businessIds ÚNICOS porque el cache
// es global al módulo.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TenantLifecycle } from '../../generated/prisma/client.js';
import { resolveTenantState, invalidate, type TenantStateDb } from '../resolver.js';

const T0 = new Date('2026-07-10T12:00:00.000Z');
/** Reloj corrido `seconds` segundos respecto a T0. */
function at(seconds: number): Date {
  return new Date(T0.getTime() + seconds * 1000);
}

/** Doble de BD mutable con contador: cambiar `row` simula una transición escrita por otro carril. */
function countingDb(initial: { lifecycle: TenantLifecycle; graceUntil?: Date | null }) {
  const state = { row: initial, reads: 0 };
  const db: TenantStateDb = {
    business: {
      findUnique: async () => {
        state.reads += 1;
        return {
          lifecycle: state.row.lifecycle,
          graceUntil: state.row.graceUntil ?? null,
          suspendedAt: null,
        };
      },
    },
  };
  return { db, state };
}

describe('resolveTenantState — cache TTL', () => {
  test('hit dentro del TTL no re-lee BD', async () => {
    const { db, state } = countingDb({ lifecycle: TenantLifecycle.ACTIVE });
    await resolveTenantState('cache-hit', { db, now: at(0) });
    await resolveTenantState('cache-hit', { db, now: at(10) });
    await resolveTenantState('cache-hit', { db, now: at(30) });
    assert.equal(state.reads, 1, 'una sola lectura de BD dentro del TTL');
  });

  test('TTL expirado re-lee BD y refleja el estado nuevo', async () => {
    const { db, state } = countingDb({ lifecycle: TenantLifecycle.ACTIVE });
    const first = await resolveTenantState('cache-ttl', { db, now: at(0) });
    assert.equal(first.effective, TenantLifecycle.ACTIVE);

    // Otro proceso suspende el negocio; este proceso aún sirve el estado cacheado…
    state.row = { lifecycle: TenantLifecycle.SUSPENDED };
    const stale = await resolveTenantState('cache-ttl', { db, now: at(30) });
    assert.equal(stale.effective, TenantLifecycle.ACTIVE, 'dentro del TTL sirve cache');
    assert.equal(state.reads, 1);

    // …y pasado el TTL (45s por defecto) re-lee y corta.
    const fresh = await resolveTenantState('cache-ttl', { db, now: at(61) });
    assert.equal(fresh.effective, TenantLifecycle.SUSPENDED, 'tras el TTL refleja el corte');
    assert.equal(state.reads, 2);
  });

  test('invalidate() fuerza re-lectura inmediata (corte/reactivación sin esperar TTL)', async () => {
    const { db, state } = countingDb({ lifecycle: TenantLifecycle.ACTIVE });
    await resolveTenantState('cache-invalidate', { db, now: at(0) });
    assert.equal(state.reads, 1);

    // Transición (PUT lifecycle) escribe BD e invalida el cache del proceso.
    state.row = { lifecycle: TenantLifecycle.SUSPENDED };
    invalidate('cache-invalidate');

    const after = await resolveTenantState('cache-invalidate', { db, now: at(1) });
    assert.equal(state.reads, 2, 'invalidate fuerza miss');
    assert.equal(after.effective, TenantLifecycle.SUSPENDED);
  });
});

describe('resolveTenantState — GRACE perezoso sobre cache', () => {
  test('gracia que expira a mitad de TTL corta sin re-leer ni escribir BD', async () => {
    const graceUntil = at(20); // expira dentro de la ventana del TTL
    const { db, state } = countingDb({ lifecycle: TenantLifecycle.GRACE, graceUntil });

    const before = await resolveTenantState('cache-grace', { db, now: at(0) });
    assert.equal(before.effective, TenantLifecycle.GRACE);
    assert.equal(before.graceUntil?.getTime(), graceUntil.getTime());

    const after = await resolveTenantState('cache-grace', { db, now: at(21) });
    assert.equal(after.effective, TenantLifecycle.SUSPENDED, 'GRACE expirado → SUSPENDED efectivo');
    assert.equal(after.graceUntil, undefined, 'sin graceUntil al cortar');
    assert.equal(state.reads, 1, 'sin re-lectura: se computa sobre lo cacheado');
    // El doble NO expone update/write alguno: si el resolver intentara escribir, petaría.
  });

  test('negocio inexistente → TERMINATED efectivo (fail-closed)', async () => {
    const db: TenantStateDb = { business: { findUnique: async () => null } };
    const missing = await resolveTenantState('cache-missing', { db, now: at(0) });
    assert.equal(missing.effective, TenantLifecycle.TERMINATED);
  });
});
