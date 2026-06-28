// Unit tests para reminderDrainer.ts
// Runner: node --import tsx --test
//
// Estrategia: dependencias inyectadas via DrainerDeps (DI).
// No se usa DB ni SMTP real. Se verifican los contratos de estado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { _drainWithDeps, backoffMs } from '../reminderDrainer.js';
import type { DrainerDeps, NotificationRow, NotificationUpdate } from '../reminderDrainer.js';

// ---------------------------------------------------------------------------
// Builders de mocks reutilizables
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'notif-1',
    tipo: 'booking.reminder.24h',
    destino: 'cliente@test.com',
    businessId: 'biz-1',
    intentos: 0,
    payload: {
      bookingId: 'booking-1',
      customerName: 'Ana García',
      serviceName: 'Corte de cabello',
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      businessName: 'Peluquería Test',
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<DrainerDeps> = {}): DrainerDeps & { updates: Record<string, NotificationUpdate>; emailCalls: number } {
  const updates: Record<string, NotificationUpdate> = {};
  let emailCalls = 0;

  const deps: DrainerDeps = {
    claimPending: async () => [],
    findBooking: async (_id: string) => ({ id: 'booking-1' }),
    updateNotification: async (id, data) => { updates[id] = data; },
    sendEmail: async () => { emailCalls++; return true; },
    ...overrides,
  };

  return Object.assign(deps, { get updates() { return updates; }, get emailCalls() { return emailCalls; } });
}

// ---------------------------------------------------------------------------
// DB vacía → sin crash
// ---------------------------------------------------------------------------
describe('drainer — DB vacía', () => {
  test('termina sin error con 0 filas reclamadas', async () => {
    const deps = makeDeps({ claimPending: async () => [] });
    await assert.doesNotReject(() => _drainWithDeps(deps));
  });
});

// ---------------------------------------------------------------------------
// 1 fila reclamada + booking activo → sendEmail + estado 'sent' + lock liberado
// ---------------------------------------------------------------------------
describe('drainer — fila reclamada con booking activo', () => {
  test('llama sendEmail, marca sent y libera el lock', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let emailCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow()],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => { emailCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(emailCalls, 1);
    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'sent');
    assert.equal(upd.lockedAt, null); // lock liberado
    assert.ok(upd.enviadoEn instanceof Date);
  });

  test('soft-fail bajo el tope → reintento pending con backoff (no failed)', async () => {
    const updates: Record<string, NotificationUpdate> = {};

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ intentos: 0 })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => false,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'pending');   // reintento, no terminal
    assert.equal(upd.intentos, 1);
    assert.equal(upd.lockedAt, null);      // libera el lock para el reintento
    assert.ok(upd.programadoEn instanceof Date && upd.programadoEn.getTime() > Date.now());
  });

  test('sendEmail que LANZA se trata como soft-fail (no deja la fila en processing)', async () => {
    const updates: Record<string, NotificationUpdate> = {};

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ intentos: 0 })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => { throw new Error('SMTP caído'); },
    };

    await assert.doesNotReject(() => _drainWithDeps(deps));

    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'pending'); // reintento, no queda en processing
    assert.equal(upd.intentos, 1);
    assert.equal(upd.lockedAt, null);    // lock liberado
  });

  test('soft-fail al alcanzar el tope de intentos → failed (terminal)', async () => {
    const updates: Record<string, NotificationUpdate> = {};

    const deps: DrainerDeps = {
      // intentos=2: el siguiente fallo lo lleva a 3 (MAX_ATTEMPTS por defecto) → failed.
      claimPending: async () => [makeRow({ intentos: 2 })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => false,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'failed');
    assert.equal(upd.intentos, 3);
    assert.equal(upd.lockedAt, null);
    assert.equal(upd.programadoEn, undefined); // terminal: no reprograma
  });
});

// ---------------------------------------------------------------------------
// backoff exponencial (capado)
// ---------------------------------------------------------------------------
describe('drainer — backoffMs', () => {
  test('crece exponencialmente y nunca baja entre intentos', () => {
    const b1 = backoffMs(1);
    const b2 = backoffMs(2);
    const b3 = backoffMs(3);
    assert.ok(b1 > 0);
    assert.ok(b2 >= b1);
    assert.ok(b3 >= b2);
  });

  test('no supera el tope para intentos grandes', () => {
    const big = backoffMs(50);
    assert.ok(Number.isFinite(big));
    // BACKOFF_MAX_MS por defecto = 1h. Con intentos altos debe quedar capado.
    assert.ok(big <= 60 * 60_000);
  });
});

// ---------------------------------------------------------------------------
// booking CANCELLED / inexistente → estado 'skipped', no llama sendEmail
// ---------------------------------------------------------------------------
describe('drainer — booking cancelado', () => {
  test('skipped + lock liberado sin sendEmail cuando findBooking devuelve null', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let emailCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow()],
      findBooking: async () => null,
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => { emailCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(emailCalls, 0);
    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'skipped');
    assert.equal(upd.lockedAt, null);
  });
});

// ---------------------------------------------------------------------------
// idempotencia — segunda iteración sin filas reclamadas no reenvía
// ---------------------------------------------------------------------------
describe('drainer — idempotencia', () => {
  test('segunda iteración no llama sendEmail si claimPending devuelve vacío', async () => {
    let emailCalls = 0;
    let callCount = 0;

    const deps: DrainerDeps = {
      claimPending: async () => {
        callCount++;
        return callCount === 1 ? [makeRow()] : [];
      },
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async () => {},
      sendEmail: async () => { emailCalls++; return true; },
    };

    await _drainWithDeps(deps); // primera iteración → email enviado
    await _drainWithDeps(deps); // segunda iteración → sin filas

    assert.equal(emailCalls, 1);
  });
});

// ---------------------------------------------------------------------------
// destino null → skipped sin sendEmail
// ---------------------------------------------------------------------------
describe('drainer — fila sin destino email', () => {
  test('skipped cuando destino es null', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let emailCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ destino: null })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => { emailCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(emailCalls, 0);
    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'skipped');
  });
});

// ---------------------------------------------------------------------------
// error global en claimPending → no lanza al exterior
// ---------------------------------------------------------------------------
describe('drainer — error global', () => {
  test('no lanza cuando claimPending lanza', async () => {
    const deps: DrainerDeps = {
      claimPending: async () => { throw new Error('DB connection lost'); },
      findBooking: async () => null,
      updateNotification: async () => {},
      sendEmail: async () => false,
    };

    await assert.doesNotReject(() => _drainWithDeps(deps));
  });

  test('un error procesando una fila no aborta el resto del lote', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let emailCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ id: 'a' }), makeRow({ id: 'b' })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => {
        if (id === 'a') throw new Error('update a falló');
        updates[id] = data;
      },
      sendEmail: async () => { emailCalls++; return true; },
    };

    await assert.doesNotReject(() => _drainWithDeps(deps));
    // 'a' lanzó al actualizar, pero 'b' se procesó igualmente.
    assert.equal(updates['b']?.estado, 'sent');
  });
});

// ---------------------------------------------------------------------------
// payload inválido → skipped sin sendEmail
// ---------------------------------------------------------------------------
describe('drainer — payload inválido', () => {
  test('skipped cuando el payload no tiene bookingId ni customerName', async () => {
    const updates: Record<string, NotificationUpdate> = {};

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ payload: { foo: 'bar' } })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => true,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'skipped');
  });
});
