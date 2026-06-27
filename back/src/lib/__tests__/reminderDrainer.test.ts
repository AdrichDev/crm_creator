// Unit tests para reminderDrainer.ts
// Runner: node --import tsx --test
//
// Estrategia: dependencias inyectadas via DrainerDeps (DI).
// No se usa DB ni SMTP real. Se verifican los contratos de estado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { _drainWithDeps, processRow } from '../reminderDrainer.js';
import type { DrainerDeps, NotificationRow } from '../reminderDrainer.js';

// ---------------------------------------------------------------------------
// Builders de mocks reutilizables
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'notif-1',
    tipo: 'booking.reminder.24h',
    destino: 'cliente@test.com',
    businessId: 'biz-1',
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

function makeDeps(overrides: Partial<DrainerDeps> = {}): DrainerDeps & { updates: Record<string, unknown>; emailCalls: number } {
  const updates: Record<string, unknown> = {};
  let emailCalls = 0;

  const deps: DrainerDeps = {
    findPending: async () => [],
    findBooking: async (_id: string) => ({ id: 'booking-1' }),
    updateNotification: async (id, data) => { updates[id] = data; },
    sendEmail: async () => { emailCalls++; return true; },
    ...overrides,
  };

  return Object.assign(deps, { get updates() { return updates; }, get emailCalls() { return emailCalls; } });
}

// ---------------------------------------------------------------------------
// Test B.4.1: DB vacía → sin crash
// ---------------------------------------------------------------------------
describe('drainer — DB vacía', () => {
  test('termina sin error con 0 filas pending', async () => {
    const deps = makeDeps({ findPending: async () => [] });
    await assert.doesNotReject(() => _drainWithDeps(deps));
  });
});

// ---------------------------------------------------------------------------
// Test B.4.2: 1 fila pending + booking activo → sendEmail + estado 'sent'
// ---------------------------------------------------------------------------
describe('drainer — fila pending con booking activo', () => {
  test('llama sendEmail y actualiza estado a sent', async () => {
    const updates: Record<string, unknown> = {};
    let emailCalls = 0;

    const deps: DrainerDeps = {
      findPending: async () => [makeRow()],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => { emailCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(emailCalls, 1);
    const upd = updates['notif-1'] as { estado: string };
    assert.equal(upd.estado, 'sent');
  });

  test('actualiza estado a failed cuando sendEmail devuelve false', async () => {
    const updates: Record<string, unknown> = {};

    const deps: DrainerDeps = {
      findPending: async () => [makeRow()],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => false,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-1'] as { estado: string };
    assert.equal(upd.estado, 'failed');
  });
});

// ---------------------------------------------------------------------------
// Test B.4.3: booking CANCELLED → estado 'skipped', no llama sendEmail
// ---------------------------------------------------------------------------
describe('drainer — booking cancelado', () => {
  test('skipped sin sendEmail cuando findBooking devuelve null', async () => {
    const updates: Record<string, unknown> = {};
    let emailCalls = 0;

    const deps: DrainerDeps = {
      findPending: async () => [makeRow()],
      findBooking: async () => null,   // booking no encontrado (CANCELLED o inexistente)
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => { emailCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(emailCalls, 0);
    const upd = updates['notif-1'] as { estado: string };
    assert.equal(upd.estado, 'skipped');
  });
});

// ---------------------------------------------------------------------------
// Test B.4.4: booking inexistente → estado 'skipped'
// ---------------------------------------------------------------------------
describe('drainer — booking inexistente', () => {
  test('skipped cuando el booking no existe en DB', async () => {
    const updates: Record<string, unknown> = {};

    const deps: DrainerDeps = {
      findPending: async () => [makeRow({ id: 'notif-2' })],
      findBooking: async () => null,
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => true,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-2'] as { estado: string };
    assert.equal(upd.estado, 'skipped');
  });
});

// ---------------------------------------------------------------------------
// Test B.4.5: idempotencia — upsert no duplica (verificado en schema; aquí
// verificamos que el drainer no procesa la misma fila dos veces si se llama
// dos veces con findPending que ya no devuelve la fila).
// ---------------------------------------------------------------------------
describe('drainer — idempotencia', () => {
  test('segunda iteración no llama sendEmail si findPending devuelve vacío', async () => {
    let emailCalls = 0;
    let callCount = 0;

    const deps: DrainerDeps = {
      findPending: async () => {
        callCount++;
        // Primera llamada: devuelve 1 fila; segunda: ya no hay pending.
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
// Test B.4.6: destino null → skipped sin sendEmail
// ---------------------------------------------------------------------------
describe('drainer — fila sin destino email', () => {
  test('skipped cuando destino es null', async () => {
    const updates: Record<string, unknown> = {};
    let emailCalls = 0;

    const deps: DrainerDeps = {
      findPending: async () => [makeRow({ destino: null })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => { emailCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(emailCalls, 0);
    const upd = updates['notif-1'] as { estado: string };
    assert.equal(upd.estado, 'skipped');
  });
});

// ---------------------------------------------------------------------------
// Test B.4.7: error global en findPending → no lanza al exterior
// ---------------------------------------------------------------------------
describe('drainer — error global', () => {
  test('no lanza cuando findPending lanza', async () => {
    const deps: DrainerDeps = {
      findPending: async () => { throw new Error('DB connection lost'); },
      findBooking: async () => null,
      updateNotification: async () => {},
      sendEmail: async () => false,
    };

    await assert.doesNotReject(() => _drainWithDeps(deps));
  });
});

// ---------------------------------------------------------------------------
// Test B.4.8: payload inválido → skipped sin sendEmail
// ---------------------------------------------------------------------------
describe('drainer — payload inválido', () => {
  test('skipped cuando el payload no tiene bookingId ni customerName', async () => {
    const updates: Record<string, unknown> = {};

    const deps: DrainerDeps = {
      findPending: async () => [makeRow({ payload: { foo: 'bar' } })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      sendEmail: async () => true,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-1'] as { estado: string };
    assert.equal(upd.estado, 'skipped');
  });
});
