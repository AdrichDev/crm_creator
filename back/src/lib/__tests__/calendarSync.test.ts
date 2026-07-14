// Unit tests para lib/calendarSync.ts (poller Calendar → crm.reserva, WU3, T3.3).
// Runner: node --import tsx --test. Núcleo de conciliación probado con deps inyectadas,
// sin DB ni red. Cubre: update/cancel de reservas del CRM, import de eventos externos,
// aislamiento por businessId y soft-fail (token revocado / listado caído / evento roto).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileEvent,
  syncCredential,
  runCalendarSyncWithDeps,
  type CalendarSyncDeps,
  type SyncBookingRow,
  type BookingUpdate,
  type CreatedBookingInput,
} from '../calendarSync.js';
import { BookingStatus } from '../generated/prisma/client.js';
import { IntegrationMissingError, ReauthRequiredError } from '../integrations/oauth.js';
import type { GoogleCalendarEvent } from '../integrations/calendar.js';

interface Recorder {
  updates: { id: string; data: BookingUpdate }[];
  creates: { businessId: string; input: CreatedBookingInput }[];
  links: { businessId: string; eventId: string; bookingId: string }[];
}

function makeDeps(overrides: Partial<CalendarSyncDeps> = {}): { deps: CalendarSyncDeps; rec: Recorder } {
  const rec: Recorder = { updates: [], creates: [], links: [] };
  const deps: CalendarSyncDeps = {
    listCredentials: async () => [{ businessId: 'biz-1' }],
    getToken: async () => 'tok',
    listEvents: async () => [],
    findBooking: async (): Promise<SyncBookingRow | null> => null,
    updateBooking: async (id, data) => { rec.updates.push({ id, data }); },
    resolveTarget: async () => ({ locationId: 'loc-1', serviceId: 'svc-1' }),
    createBooking: async (businessId, input) => { rec.creates.push({ businessId, input }); return { id: 'new-bk' }; },
    linkEvent: async (businessId, _t, eventId, bookingId) => { rec.links.push({ businessId, eventId, bookingId }); },
    findImportedBooking: async (): Promise<SyncBookingRow | null> => null,
    getTimeZone: async () => 'UTC', // por defecto sin desplazamiento; los tests de TZ lo sobreescriben
    ...overrides,
  };
  return { deps, rec };
}

function crmEvent(bookingId: string, extra: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id: 'gev-' + bookingId,
    status: 'confirmed',
    start: { dateTime: '2026-07-10T09:00:00.000Z' },
    end: { dateTime: '2026-07-10T09:30:00.000Z' },
    extendedProperties: { private: { crmBookingId: bookingId } },
    ...extra,
  };
}

describe('reconcileEvent — evento originado en el CRM', () => {
  test('activo y reprogramado → actualiza start/end de la reserva', async () => {
    const { deps, rec } = makeDeps({
      findBooking: async () => ({ id: 'bk-1', status: 'CONFIRMED' }),
    });
    await reconcileEvent('biz-1', 'tok', crmEvent('bk-1'), deps);
    assert.equal(rec.updates.length, 1);
    assert.equal(rec.updates[0].id, 'bk-1');
    assert.deepEqual(rec.updates[0].data.startAt, new Date('2026-07-10T09:00:00.000Z'));
    assert.deepEqual(rec.updates[0].data.endAt, new Date('2026-07-10T09:30:00.000Z'));
    assert.equal(rec.creates.length, 0);
  });

  test('cancelado en Google → marca la reserva CANCELLED con prevStatus', async () => {
    const { deps, rec } = makeDeps({
      findBooking: async () => ({ id: 'bk-1', status: 'CONFIRMED' }),
    });
    await reconcileEvent('biz-1', 'tok', crmEvent('bk-1', { status: 'cancelled' }), deps);
    assert.equal(rec.updates.length, 1);
    assert.equal(rec.updates[0].data.status, BookingStatus.CANCELLED);
    assert.equal(rec.updates[0].data.prevStatus, 'CONFIRMED');
  });

  test('cancelado pero la reserva ya está CANCELLED → no reescribe', async () => {
    const { deps, rec } = makeDeps({
      findBooking: async () => ({ id: 'bk-1', status: 'CANCELLED' }),
    });
    await reconcileEvent('biz-1', 'tok', crmEvent('bk-1', { status: 'cancelled' }), deps);
    assert.equal(rec.updates.length, 0);
  });

  test('reserva borrada en el CRM (findBooking null) → no-op', async () => {
    const { deps, rec } = makeDeps({ findBooking: async () => null });
    await reconcileEvent('biz-1', 'tok', crmEvent('bk-1'), deps);
    assert.equal(rec.updates.length, 0);
    assert.equal(rec.creates.length, 0);
  });
});

describe('reconcileEvent — evento externo (sin etiqueta)', () => {
  const external: GoogleCalendarEvent = {
    id: 'ext-1', status: 'confirmed', summary: 'Reunión externa',
    start: { dateTime: '2026-07-11T10:00:00.000Z' },
    end: { dateTime: '2026-07-11T11:00:00.000Z' },
  };

  test('crea la reserva con ubicación/servicio por defecto y escribe la etiqueta de vuelta', async () => {
    const { deps, rec } = makeDeps();
    await reconcileEvent('biz-1', 'tok', external, deps);
    assert.equal(rec.creates.length, 1);
    assert.equal(rec.creates[0].businessId, 'biz-1');
    assert.equal(rec.creates[0].input.locationId, 'loc-1');
    assert.equal(rec.creates[0].input.serviceId, 'svc-1');
    assert.equal(rec.creates[0].input.summary, 'Reunión externa');
    // write-back del vínculo evento↔reserva
    assert.deepEqual(rec.links, [{ businessId: 'biz-1', eventId: 'ext-1', bookingId: 'new-bk' }]);
  });

  test('negocio sin ubicación (resolveTarget null) → no crea nada (soft-skip)', async () => {
    const { deps, rec } = makeDeps({ resolveTarget: async () => null });
    await reconcileEvent('biz-1', 'tok', external, deps);
    assert.equal(rec.creates.length, 0);
    assert.equal(rec.links.length, 0);
  });

  test('evento de día completo (date, sin dateTime) → no se importa', async () => {
    const { deps, rec } = makeDeps();
    await reconcileEvent('biz-1', 'tok', {
      id: 'allday', status: 'confirmed', start: { date: '2026-07-11' }, end: { date: '2026-07-12' },
    }, deps);
    assert.equal(rec.creates.length, 0);
  });

  test('externo y cancelado → nada que importar', async () => {
    const { deps, rec } = makeDeps();
    await reconcileEvent('biz-1', 'tok', { ...external, status: 'cancelled' }, deps);
    assert.equal(rec.creates.length, 0);
  });

  test('write-back falla → no lanza, la creación se mantiene', async () => {
    const { deps, rec } = makeDeps({ linkEvent: async () => { throw new Error('patch 500'); } });
    await reconcileEvent('biz-1', 'tok', external, deps);
    assert.equal(rec.creates.length, 1); // la reserva se creó pese al fallo del write-back
  });

  // Bug MEDIUM (revisión fresca WU3): si el linkEvent de una pasada anterior falló
  // (5xx/rate-limit), el evento vuelve a llegar sin etiqueta en la siguiente pasada del
  // poller (dentro de la ventana updatedMin). Sin idempotencia, createBooking se vuelve a
  // llamar → reserva duplicada persistente. El fix busca la reserva ya importada por
  // ventana horaria exacta (mismo servicio marcador) ANTES de crear, y si existe, solo
  // reintenta el write-back.
  test('idempotencia: ya existe reserva importada para esta ventana → NO duplica, reintenta linkEvent', async () => {
    const { deps, rec } = makeDeps({
      findImportedBooking: async () => ({ id: 'bk-ya-importada', status: 'CONFIRMED' }),
    });
    await reconcileEvent('biz-1', 'tok', external, deps);
    assert.equal(rec.creates.length, 0); // no se crea una segunda reserva
    assert.deepEqual(rec.links, [{ businessId: 'biz-1', eventId: 'ext-1', bookingId: 'bk-ya-importada' }]);
  });

  test('idempotencia: si el reintento de linkEvent también falla, no lanza y sigue sin crear', async () => {
    const { deps, rec } = makeDeps({
      findImportedBooking: async () => ({ id: 'bk-ya-importada', status: 'CONFIRMED' }),
      linkEvent: async () => { throw new Error('patch 500 otra vez'); },
    });
    await reconcileEvent('biz-1', 'tok', external, deps); // no lanza
    assert.equal(rec.creates.length, 0);
    assert.equal(rec.links.length, 0);
  });

  test('sin reserva importada previa (findImportedBooking null) → crea normalmente', async () => {
    const { deps, rec } = makeDeps({ findImportedBooking: async () => null });
    await reconcileEvent('biz-1', 'tok', external, deps);
    assert.equal(rec.creates.length, 1);
    assert.equal(rec.creates[0].input.serviceId, 'svc-1');
  });
});

describe('syncCredential — tolerancia a fallos', () => {
  test('token revocado (ReauthRequiredError) → se salta la credencial, no lista eventos', async () => {
    let listed = false;
    const { deps } = makeDeps({
      getToken: async () => { throw new ReauthRequiredError('biz-1', 'calendar'); },
      listEvents: async () => { listed = true; return []; },
    });
    await syncCredential('biz-1', deps); // no lanza
    assert.equal(listed, false);
  });

  test('credencial ausente (IntegrationMissingError) → se salta sin lanzar', async () => {
    const { deps } = makeDeps({
      getToken: async () => { throw new IntegrationMissingError('biz-1', 'calendar'); },
    });
    await syncCredential('biz-1', deps);
  });

  test('listEvents falla (5xx) → no crashea, no concilia', async () => {
    const { deps, rec } = makeDeps({
      listEvents: async () => { throw new Error('http_503'); },
      findBooking: async () => ({ id: 'x', status: 'CONFIRMED' }),
    });
    await syncCredential('biz-1', deps);
    assert.equal(rec.updates.length, 0);
  });

  test('un evento roto no detiene el resto del lote', async () => {
    const events = [crmEvent('bk-good'), { id: 'boom' } as GoogleCalendarEvent, crmEvent('bk-good2')];
    const { deps, rec } = makeDeps({
      listEvents: async () => events,
      // findBooking lanza SOLO para el segundo (evento sin etiqueta → externo → createBooking);
      // forzamos el fallo en createBooking del evento intermedio.
      findBooking: async (_b, id) => ({ id, status: 'CONFIRMED' }),
      createBooking: async () => { throw new Error('db down'); },
    });
    await syncCredential('biz-1', deps);
    // Los dos eventos del CRM se actualizaron pese al evento externo que reventó en medio.
    assert.equal(rec.updates.length, 2);
  });

  test('aislamiento: findBooking recibe el businessId de la credencial', async () => {
    const seen: string[] = [];
    const { deps } = makeDeps({
      listEvents: async () => [crmEvent('bk-1')],
      findBooking: async (businessId) => { seen.push(businessId); return null; },
    });
    await syncCredential('biz-77', deps);
    assert.deepEqual(seen, ['biz-77']);
  });
});

describe('runCalendarSyncWithDeps', () => {
  test('itera todas las credenciales de tenant', async () => {
    const seen: string[] = [];
    const { deps } = makeDeps({
      listCredentials: async () => [{ businessId: 'a' }, { businessId: 'b' }],
      getToken: async () => 'tok',
      listEvents: async () => [],
      findBooking: async (businessId) => { seen.push(businessId); return null; },
    });
    // Fuerza que cada credencial "toque" findBooking listando un evento del CRM.
    (deps as CalendarSyncDeps).listEvents = async () => [crmEvent('bk-x')];
    await runCalendarSyncWithDeps(deps);
    assert.deepEqual(seen.sort(), ['a', 'b']);
  });

  test('un fallo global (listCredentials lanza) no propaga', async () => {
    const { deps } = makeDeps({ listCredentials: async () => { throw new Error('db down'); } });
    await runCalendarSyncWithDeps(deps); // no lanza
  });
});

describe('reconcileEvent — conversión de zona horaria del negocio (crm-calendar-tz-fix)', () => {
  test('evento Google con offset +02:00 y tz Europe/Madrid → startAt wall-clock-como-UTC', async () => {
    const { deps, rec } = makeDeps({ findBooking: async () => ({ id: 'bk-tz', status: 'CONFIRMED' }) });
    const ev = crmEvent('bk-tz', {
      start: { dateTime: '2026-07-10T11:00:00+02:00' }, // 11:00 Madrid = instante 09:00Z
      end: { dateTime: '2026-07-10T11:30:00+02:00' },
    });
    await reconcileEvent('biz-1', 'tok', ev, deps, 'Europe/Madrid');
    assert.equal(rec.updates.length, 1);
    // 11:00 Madrid se guarda como 11:00Z: la agenda lo lee con getUTCHours() → muestra 11:00.
    assert.deepEqual(rec.updates[0].data.startAt, new Date('2026-07-10T11:00:00.000Z'));
    assert.deepEqual(rec.updates[0].data.endAt, new Date('2026-07-10T11:30:00.000Z'));
  });

  test('syncCredential resuelve la TZ vía getTimeZone y la aplica al importar', async () => {
    const external: GoogleCalendarEvent = {
      id: 'ext-tz', status: 'confirmed', summary: 'Externo',
      start: { dateTime: '2026-07-11T12:00:00+02:00' }, // 12:00 Madrid
      end: { dateTime: '2026-07-11T13:00:00+02:00' },
    };
    const { deps, rec } = makeDeps({
      listEvents: async () => [external],
      getTimeZone: async () => 'Europe/Madrid',
    });
    await syncCredential('biz-1', deps);
    assert.equal(rec.creates.length, 1);
    assert.deepEqual(rec.creates[0].input.startAt, new Date('2026-07-11T12:00:00.000Z'));
  });

  test('sin tz (default UTC) NO desplaza: 09:00Z se guarda 09:00Z', async () => {
    const { deps, rec } = makeDeps({ findBooking: async () => ({ id: 'bk-utc', status: 'CONFIRMED' }) });
    await reconcileEvent('biz-1', 'tok', crmEvent('bk-utc'), deps); // tz default 'UTC'
    assert.deepEqual(rec.updates[0].data.startAt, new Date('2026-07-10T09:00:00.000Z'));
  });
});
