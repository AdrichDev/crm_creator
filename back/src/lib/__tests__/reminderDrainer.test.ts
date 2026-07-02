// Unit tests para reminderDrainer.ts
// Runner: node --import tsx --test
//
// Estrategia: dependencias inyectadas via DrainerDeps (DI).
// No se usa DB ni SMTP real. Se verifican los contratos de estado.
// El paso de envío va por el puerto (notifyReminder); su decisión emit-vs-SMTP
// se prueba abajo con el puerto real y espías inyectados.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { _drainWithDeps, backoffMs } from '../reminderDrainer.js';
import type { DrainerDeps, NotificationRow, NotificationUpdate } from '../reminderDrainer.js';
import { notifyBookingReminder, type BookingNotifyData, type NotifyDeps } from '../notify.js';

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

// ---------------------------------------------------------------------------
// DB vacía → sin crash
// ---------------------------------------------------------------------------
describe('drainer — DB vacía', () => {
  test('termina sin error con 0 filas reclamadas', async () => {
    const deps: DrainerDeps = {
      claimPending: async () => [],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async () => {},
      notifyReminder: async () => true,
    };
    await assert.doesNotReject(() => _drainWithDeps(deps));
  });
});

// ---------------------------------------------------------------------------
// 1 fila reclamada + booking activo → notifyReminder + estado 'sent' + lock liberado
// ---------------------------------------------------------------------------
describe('drainer — fila reclamada con booking activo', () => {
  test('llama notifyReminder, marca sent y libera el lock', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let notifyCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow()],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      notifyReminder: async () => { notifyCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(notifyCalls, 1);
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
      notifyReminder: async () => false,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'pending');   // reintento, no terminal
    assert.equal(upd.intentos, 1);
    assert.equal(upd.lockedAt, null);      // libera el lock para el reintento
    assert.ok(upd.programadoEn instanceof Date && upd.programadoEn.getTime() > Date.now());
  });

  test('notifyReminder que LANZA se trata como soft-fail (no deja la fila en processing)', async () => {
    const updates: Record<string, NotificationUpdate> = {};

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ intentos: 0 })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      notifyReminder: async () => { throw new Error('n8n caído'); },
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
      notifyReminder: async () => false,
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
// booking CANCELLED / inexistente → estado 'skipped', no notifica
// ---------------------------------------------------------------------------
describe('drainer — booking cancelado', () => {
  test('skipped + lock liberado sin notificar cuando findBooking devuelve null', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let notifyCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow()],
      findBooking: async () => null,
      updateNotification: async (id, data) => { updates[id] = data; },
      notifyReminder: async () => { notifyCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(notifyCalls, 0);
    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'skipped');
    assert.equal(upd.lockedAt, null);
  });
});

// ---------------------------------------------------------------------------
// idempotencia — segunda iteración sin filas reclamadas no reenvía
// ---------------------------------------------------------------------------
describe('drainer — idempotencia', () => {
  test('segunda iteración no notifica si claimPending devuelve vacío', async () => {
    let notifyCalls = 0;
    let callCount = 0;

    const deps: DrainerDeps = {
      claimPending: async () => {
        callCount++;
        return callCount === 1 ? [makeRow()] : [];
      },
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async () => {},
      notifyReminder: async () => { notifyCalls++; return true; },
    };

    await _drainWithDeps(deps); // primera iteración → notificado
    await _drainWithDeps(deps); // segunda iteración → sin filas

    assert.equal(notifyCalls, 1);
  });
});

// ---------------------------------------------------------------------------
// destino null → skipped sin notificar
// ---------------------------------------------------------------------------
describe('drainer — fila sin destino email', () => {
  test('skipped cuando destino es null', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let notifyCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ destino: null })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      notifyReminder: async () => { notifyCalls++; return true; },
    };

    await _drainWithDeps(deps);

    assert.equal(notifyCalls, 0);
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
      notifyReminder: async () => false,
    };

    await assert.doesNotReject(() => _drainWithDeps(deps));
  });

  test('un error procesando una fila no aborta el resto del lote', async () => {
    const updates: Record<string, NotificationUpdate> = {};
    let notifyCalls = 0;

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ id: 'a' }), makeRow({ id: 'b' })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => {
        if (id === 'a') throw new Error('update a falló');
        updates[id] = data;
      },
      notifyReminder: async () => { notifyCalls++; return true; },
    };

    await assert.doesNotReject(() => _drainWithDeps(deps));
    // 'a' lanzó al actualizar, pero 'b' se procesó igualmente.
    assert.equal(updates['b']?.estado, 'sent');
  });
});

// ---------------------------------------------------------------------------
// payload inválido → skipped sin notificar
// ---------------------------------------------------------------------------
describe('drainer — payload inválido', () => {
  test('skipped cuando el payload no tiene bookingId ni customerName', async () => {
    const updates: Record<string, NotificationUpdate> = {};

    const deps: DrainerDeps = {
      claimPending: async () => [makeRow({ payload: { foo: 'bar' } })],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async (id, data) => { updates[id] = data; },
      notifyReminder: async () => true,
    };

    await _drainWithDeps(deps);

    const upd = updates['notif-1'];
    assert.equal(upd.estado, 'skipped');
  });
});

// ---------------------------------------------------------------------------
// Ruteo del puerto (2.1): con URL → emit; sin URL → sendEmail. Mismo drainer,
// mismo puerto real (notifyBookingReminder), espías inyectados en NotifyDeps.
// ---------------------------------------------------------------------------
describe('drainer — puerto: emit vs SMTP según AUTOMATION_WEBHOOK_URL', () => {
  function drainerWithNotifyDeps(notifyDeps: NotifyDeps): DrainerDeps {
    return {
      claimPending: async () => [makeRow()],
      findBooking: async () => ({ id: 'booking-1' }),
      updateNotification: async () => {},
      notifyReminder: (row, payload) => {
        const ventana = row.tipo === 'booking.reminder.24h' ? '24h' : '2h';
        const data: BookingNotifyData = {
          bookingId: payload.bookingId,
          businessId: row.businessId,
          businessName: payload.businessName,
          customerName: payload.customerName,
          email: row.destino ?? '',
          serviceName: payload.serviceName,
          employeeName: payload.employeeName,
          startsAt: new Date(payload.startsAt),
        };
        return notifyBookingReminder(data, ventana, row.id, notifyDeps);
      },
    };
  }

  test('con URL → emit llamado, sendEmail NO', async () => {
    let emitCalls = 0;
    let mailCalls = 0;
    const notifyDeps: NotifyDeps = {
      webhookUrl: 'https://n8n/webhook',
      emit: (async (name: string, _d: unknown, opts: { businessId: string; eventId?: string }) => {
        emitCalls++;
        return { status: 'sent', eventId: opts.eventId ?? 'x' };
      }) as NotifyDeps['emit'],
      sendEmail: async () => { mailCalls++; return true; },
    };

    await _drainWithDeps(drainerWithNotifyDeps(notifyDeps));

    assert.equal(emitCalls, 1);
    assert.equal(mailCalls, 0);
  });

  test('sin URL → sendEmail llamado, emit NO (regresión SMTP intacta)', async () => {
    let emitCalls = 0;
    let mailCalls = 0;
    const notifyDeps: NotifyDeps = {
      webhookUrl: '',
      emit: (async () => { emitCalls++; return { status: 'sent', eventId: 'x' }; }) as NotifyDeps['emit'],
      sendEmail: async () => { mailCalls++; return true; },
    };

    await _drainWithDeps(drainerWithNotifyDeps(notifyDeps));

    assert.equal(mailCalls, 1);
    assert.equal(emitCalls, 0);
  });
});
