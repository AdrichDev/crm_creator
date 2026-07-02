// Unit tests para calendarEmitter.ts (WU3.1).
// Runner: node --import tsx --test
// Estrategia: deps.emit mockeado (mismo patrón que notify.ts/bookings.email.test.ts) —
// sin red real, sin webhook n8n real.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pushCalendarEvent, maybePushCalendarEvent } from '../calendarEmitter.js';
import type { CalendarPushData, CalendarEmitterDeps } from '../calendarEmitter.js';
import type { emit as defaultEmit } from '../automation/index.js';

function makeData(overrides: Partial<CalendarPushData> = {}): CalendarPushData {
  return {
    uid: 'booking-abc123@crm',
    businessId: 'biz-1',
    titulo: 'Corte de pelo — Ana García',
    inicio: new Date('2026-07-10T10:00:00Z'),
    fin: new Date('2026-07-10T10:30:00Z'),
    direccion: 'Calle Mayor 1',
    ...overrides,
  };
}

describe('pushCalendarEvent — toggle on (payload correcto)', () => {
  test('llama emit con nombre calendar.event_push y payload {uid, titulo, inicio, fin, direccion}', async () => {
    let calledWith: unknown[] = [];
    const deps: CalendarEmitterDeps = {
      emit: (async (...args: unknown[]) => {
        calledWith = args;
        return { status: 'sent', eventId: 'evt-1' };
      }) as typeof defaultEmit,
    };

    const ok = await pushCalendarEvent(makeData(), deps);

    assert.equal(ok, true);
    assert.equal(calledWith[0], 'calendar.event_push');
    assert.deepEqual(calledWith[1], {
      uid: 'booking-abc123@crm',
      titulo: 'Corte de pelo — Ana García',
      inicio: '2026-07-10T10:00:00.000Z',
      fin: '2026-07-10T10:30:00.000Z',
      direccion: 'Calle Mayor 1',
    });
    const opts = calledWith[2] as { businessId: string; eventId: string };
    assert.equal(opts.businessId, 'biz-1');
    assert.equal(opts.eventId, 'booking-abc123@crm');
  });

  test('eventId idempotente = uid (evita duplicados en reintentos)', async () => {
    let eventId = '';
    const deps: CalendarEmitterDeps = {
      emit: (async (_name, _data, opts: { eventId?: string }) => {
        eventId = opts.eventId ?? '';
        return { status: 'sent', eventId };
      }) as typeof defaultEmit,
    };
    await pushCalendarEvent(makeData({ uid: 'reminder-xyz@crm' }), deps);
    assert.equal(eventId, 'reminder-xyz@crm');
  });

  test('duplicate (idempotencia de emit) cuenta como despachado', async () => {
    const deps: CalendarEmitterDeps = {
      emit: (async () => ({ status: 'skipped', reason: 'duplicate' })) as typeof defaultEmit,
    };
    assert.equal(await pushCalendarEvent(makeData(), deps), true);
  });
});

describe('maybePushCalendarEvent — toggle off → cero llamadas (regla de negocio 10)', () => {
  test('pushEnabled=false no invoca emit en absoluto', async () => {
    let emitCalls = 0;
    const deps: CalendarEmitterDeps = {
      emit: (async () => { emitCalls++; return { status: 'sent', eventId: 'x' }; }) as typeof defaultEmit,
    };
    const ok = await maybePushCalendarEvent(false, makeData(), deps);
    assert.equal(ok, false);
    assert.equal(emitCalls, 0);
  });

  test('pushEnabled=true invoca emit exactamente una vez', async () => {
    let emitCalls = 0;
    const deps: CalendarEmitterDeps = {
      emit: (async () => { emitCalls++; return { status: 'sent', eventId: 'x' }; }) as typeof defaultEmit,
    };
    const ok = await maybePushCalendarEvent(true, makeData(), deps);
    assert.equal(ok, true);
    assert.equal(emitCalls, 1);
  });
});

describe('pushCalendarEvent — soft-fail (WU3.2)', () => {
  test('emit "failed" (n8n caído/timeout) → devuelve false sin lanzar', async () => {
    const deps: CalendarEmitterDeps = {
      emit: (async () => ({ status: 'failed', eventId: 'x', error: 'timeout' })) as typeof defaultEmit,
    };
    await assert.doesNotReject(async () => {
      const ok = await pushCalendarEvent(makeData(), deps);
      assert.equal(ok, false);
    });
  });

  test('emit "disabled" (webhook no configurado) → devuelve false sin lanzar', async () => {
    const deps: CalendarEmitterDeps = {
      emit: (async () => ({ status: 'skipped', reason: 'disabled' })) as typeof defaultEmit,
    };
    const ok = await pushCalendarEvent(makeData(), deps);
    assert.equal(ok, false);
  });

  test('emit que lanza (error no capturado por el propio emit) se propaga — el caller debe envolverlo (igual que notify.ts)', async () => {
    const deps: CalendarEmitterDeps = {
      emit: (async () => { throw new Error('network error'); }) as unknown as typeof defaultEmit,
    };
    await assert.rejects(() => pushCalendarEvent(makeData(), deps));
  });
});
