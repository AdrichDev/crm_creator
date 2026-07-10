import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TenantLifecycle } from '../../generated/prisma/client.js';
import {
  resolveTransition,
  TenantTransitionError,
  TENANT_LIFECYCLE_STATES,
  DEFAULT_TRANSITION_ACTOR,
} from '../transitions.js';

// Reloj fijo para deterministas. `graceUntil` futuro/pasado se calcula respecto a esta base.
const NOW = new Date('2026-07-10T12:00:00.000Z');
const FUTURE = new Date('2026-07-20T12:00:00.000Z');
const PAST = new Date('2026-07-01T12:00:00.000Z');

describe('resolveTransition — cualquier estado → cualquier estado (sin 409)', () => {
  test('las 16 combinaciones se aplican (GRACE recibe graceUntil futuro)', () => {
    for (const fromState of TENANT_LIFECYCLE_STATES) {
      for (const toState of TENANT_LIFECYCLE_STATES) {
        const payload =
          toState === TenantLifecycle.GRACE
            ? { state: toState, graceUntil: FUTURE }
            : { state: toState };
        const { patch, event } = resolveTransition(fromState, payload, { now: NOW });
        assert.equal(patch.lifecycle, toState, `${fromState}→${toState} debe fijar el estado`);
        assert.equal(event.fromState, fromState);
        assert.equal(event.toState, toState);
      }
    }
  });

  test('TERMINATED → ACTIVE es legal y limpia gracia/suspensión', () => {
    const { patch } = resolveTransition(
      TenantLifecycle.TERMINATED,
      { state: TenantLifecycle.ACTIVE },
      { now: NOW },
    );
    assert.equal(patch.lifecycle, TenantLifecycle.ACTIVE);
    assert.equal(patch.graceUntil, null);
    assert.equal(patch.suspendedAt, null);
  });
});

describe('resolveTransition — side-effects por estado destino', () => {
  test('→ SUSPENDED fija suspendedAt = now', () => {
    const { patch } = resolveTransition(
      TenantLifecycle.ACTIVE,
      { state: TenantLifecycle.SUSPENDED },
      { now: NOW },
    );
    assert.equal(patch.suspendedAt?.getTime(), NOW.getTime());
  });

  test('→ GRACE con fecha futura fija graceUntil', () => {
    const { patch } = resolveTransition(
      TenantLifecycle.ACTIVE,
      { state: TenantLifecycle.GRACE, graceUntil: FUTURE },
      { now: NOW },
    );
    assert.equal(patch.graceUntil?.getTime(), FUTURE.getTime());
  });

  test('→ GRACE acepta graceUntil como string ISO', () => {
    const { patch } = resolveTransition(
      TenantLifecycle.ACTIVE,
      { state: TenantLifecycle.GRACE, graceUntil: FUTURE.toISOString() },
      { now: NOW },
    );
    assert.equal(patch.graceUntil?.getTime(), FUTURE.getTime());
  });

  test('→ TERMINATED solo cambia el estado (no toca gracia/suspensión → sin purga)', () => {
    const { patch } = resolveTransition(
      TenantLifecycle.ACTIVE,
      { state: TenantLifecycle.TERMINATED },
      { now: NOW },
    );
    assert.equal(patch.lifecycle, TenantLifecycle.TERMINATED);
    assert.equal(patch.graceUntil, undefined);
    assert.equal(patch.suspendedAt, undefined);
  });
});

describe('resolveTransition — validación de payload (400, nunca 409)', () => {
  test('→ GRACE sin graceUntil → 400', () => {
    assert.throws(
      () => resolveTransition(TenantLifecycle.ACTIVE, { state: TenantLifecycle.GRACE }, { now: NOW }),
      (err: unknown) => {
        assert.ok(err instanceof TenantTransitionError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'grace_until_required');
        return true;
      },
    );
  });

  test('→ GRACE con graceUntil pasado → 400', () => {
    assert.throws(
      () =>
        resolveTransition(
          TenantLifecycle.ACTIVE,
          { state: TenantLifecycle.GRACE, graceUntil: PAST },
          { now: NOW },
        ),
      (err: unknown) => err instanceof TenantTransitionError && err.status === 400,
    );
  });

  test('estado destino desconocido → 400', () => {
    assert.throws(
      () => resolveTransition(TenantLifecycle.ACTIVE, { state: 'BANANA' }, { now: NOW }),
      (err: unknown) => {
        assert.ok(err instanceof TenantTransitionError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'unknown_state');
        return true;
      },
    );
  });

  test('ningún error de transición produce 409', () => {
    // Barrido de casos inválidos: todos deben ser 400, jamás 409.
    const badPayloads = [
      { state: TenantLifecycle.GRACE },
      { state: TenantLifecycle.GRACE, graceUntil: PAST },
      { state: 'UNKNOWN' },
      { state: '' },
    ];
    for (const fromState of TENANT_LIFECYCLE_STATES) {
      for (const payload of badPayloads) {
        try {
          resolveTransition(fromState, payload as { state: string }, { now: NOW });
        } catch (err) {
          assert.ok(err instanceof TenantTransitionError);
          assert.equal((err as TenantTransitionError).status, 400);
          assert.notEqual((err as TenantTransitionError).status, 409);
        }
      }
    }
  });
});

describe('resolveTransition — evento de auditoría', () => {
  test('resuelve fromState/toState/reason/actor', () => {
    const { event } = resolveTransition(
      TenantLifecycle.ACTIVE,
      { state: TenantLifecycle.SUSPENDED, reason: 'impago', actor: 'operator:achozas' },
      { now: NOW },
    );
    assert.deepEqual(event, {
      fromState: TenantLifecycle.ACTIVE,
      toState: TenantLifecycle.SUSPENDED,
      reason: 'impago',
      actor: 'operator:achozas',
    });
  });

  test('actor por defecto cuando no se especifica', () => {
    const { event } = resolveTransition(
      TenantLifecycle.SUSPENDED,
      { state: TenantLifecycle.ACTIVE },
      { now: NOW },
    );
    assert.equal(event.actor, DEFAULT_TRANSITION_ACTOR);
    assert.equal(event.reason, null);
  });
});
