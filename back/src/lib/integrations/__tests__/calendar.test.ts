// Unit tests para lib/integrations/calendar.ts (Google Calendar del negocio, WU3).
// Runner: node --import tsx --test. Sin red ni credencial real: getToken + fetch inyectados.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCalendarEvent,
  listCalendarEventsWithToken,
  linkEventToBookingWithToken,
  createBookingCalendarEvent,
  ProviderError,
  CRM_BOOKING_ID_KEY,
  CRM_BUSINESS_ID_KEY,
  type CalendarDeps,
  type GoogleCalendarEvent,
} from '../calendar.js';
import { IntegrationMissingError, ReauthRequiredError } from '../oauth.js';

/** Mock de fetch que captura llamadas y devuelve un status + cuerpo JSON fijos. */
function fetchStub(status: number, body: unknown = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
  return Object.assign(fn, { calls });
}

const newEvent = {
  summary: 'Corte de pelo — María',
  start: new Date('2026-07-10T09:00:00.000Z'),
  end: new Date('2026-07-10T09:30:00.000Z'),
  crmBookingId: 'bk-1',
  businessId: 'biz-1',
};

describe('createCalendarEvent', () => {
  test('200 → created con eventId; POST con Bearer + extendedProperties.private.crmBookingId', async () => {
    const fetchSpy = fetchStub(200, { id: 'gev-99' });
    const deps: CalendarDeps = { getToken: async () => 'tok-1', fetch: fetchSpy };

    const result = await createCalendarEvent(newEvent, deps);

    assert.deepEqual(result, { status: 'created', eventId: 'gev-99' });
    assert.equal(fetchSpy.calls.length, 1);
    assert.match(fetchSpy.calls[0].url, /calendars\/primary\/events$/);
    const headers = fetchSpy.calls[0].init!.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer tok-1');
    const sent = JSON.parse(fetchSpy.calls[0].init!.body as string);
    assert.equal(sent.extendedProperties.private[CRM_BOOKING_ID_KEY], 'bk-1');
    assert.equal(sent.extendedProperties.private[CRM_BUSINESS_ID_KEY], 'biz-1');
    assert.equal(sent.start.dateTime, '2026-07-10T09:00:00.000Z');
  });

  test('negocio sin Calendar (IntegrationMissingError) → missing, no llama a fetch', async () => {
    const fetchSpy = fetchStub(200);
    const deps: CalendarDeps = {
      getToken: async () => { throw new IntegrationMissingError('biz-1', 'calendar'); },
      fetch: fetchSpy,
    };
    const result = await createCalendarEvent(newEvent, deps);
    assert.deepEqual(result, { status: 'missing' });
    assert.equal(fetchSpy.calls.length, 0);
  });

  test('401 en vuelo → ReauthRequiredError', async () => {
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchStub(401) };
    await assert.rejects(() => createCalendarEvent(newEvent, deps), ReauthRequiredError);
  });

  test('5xx → ProviderError con codigo http_503', async () => {
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchStub(503) };
    await assert.rejects(
      () => createCalendarEvent(newEvent, deps),
      (err: unknown) => err instanceof ProviderError && err.codigo === 'http_503',
    );
  });
});

describe('listCalendarEventsWithToken', () => {
  test('200 → items; pide singleEvents/showDeleted y updatedMin', async () => {
    const items: GoogleCalendarEvent[] = [{ id: 'e1', status: 'confirmed' }];
    const fetchSpy = fetchStub(200, { items });
    const out = await listCalendarEventsWithToken(
      'biz-1', 'tok', { updatedMin: new Date('2026-07-01T00:00:00.000Z') }, { fetch: fetchSpy },
    );
    assert.deepEqual(out, items);
    assert.match(fetchSpy.calls[0].url, /singleEvents=true/);
    assert.match(fetchSpy.calls[0].url, /showDeleted=true/);
    assert.match(fetchSpy.calls[0].url, /updatedMin=2026-07-01/);
  });

  test('sin items → []', async () => {
    const out = await listCalendarEventsWithToken('biz-1', 'tok', {}, { fetch: fetchStub(200, {}) });
    assert.deepEqual(out, []);
  });

  test('401 → ReauthRequiredError', async () => {
    await assert.rejects(
      () => listCalendarEventsWithToken('biz-1', 'tok', {}, { fetch: fetchStub(401) }),
      ReauthRequiredError,
    );
  });
});

describe('linkEventToBookingWithToken', () => {
  test('PATCH con la etiqueta crmBookingId sobre el evento', async () => {
    const fetchSpy = fetchStub(200, {});
    await linkEventToBookingWithToken('biz-1', 'tok', 'gev-1', 'bk-9', { fetch: fetchSpy });
    assert.equal((fetchSpy.calls[0].init!.method), 'PATCH');
    assert.match(fetchSpy.calls[0].url, /events\/gev-1$/);
    const body = JSON.parse(fetchSpy.calls[0].init!.body as string);
    assert.equal(body.extendedProperties.private[CRM_BOOKING_ID_KEY], 'bk-9');
  });
});

describe('createBookingCalendarEvent (T3.4 soft-fail + telemetría)', () => {
  const data = {
    businessId: 'biz-1', bookingId: 'bk-1', summary: 'Cita',
    start: new Date('2026-07-10T09:00:00.000Z'), end: new Date('2026-07-10T09:30:00.000Z'),
  };

  test('created → true, sin telemetría', async () => {
    const emits: string[] = [];
    const ok = await createBookingCalendarEvent(data, {
      createEvent: async () => ({ status: 'created', eventId: 'g1' }),
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, true);
    assert.deepEqual(emits, []);
  });

  test('missing (negocio sin Calendar) → false, sin telemetría', async () => {
    const emits: string[] = [];
    const ok = await createBookingCalendarEvent(data, {
      createEvent: async () => ({ status: 'missing' }),
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, false);
    assert.deepEqual(emits, []);
  });

  test('ReauthRequiredError → false + emite integracion.reauth_requerido; NUNCA lanza', async () => {
    const emits: string[] = [];
    const ok = await createBookingCalendarEvent(data, {
      createEvent: async () => { throw new ReauthRequiredError('biz-1', 'calendar'); },
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, false);
    assert.deepEqual(emits, ['integracion.reauth_requerido']);
  });

  test('ProviderError → false + emite integracion.fallo_proveedor', async () => {
    const emits: string[] = [];
    const ok = await createBookingCalendarEvent(data, {
      createEvent: async () => { throw new ProviderError('calendar', 'http_500'); },
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, false);
    assert.deepEqual(emits, ['integracion.fallo_proveedor']);
  });

  test('si emit lanza, el hook sigue devolviendo false (telemetría nunca rompe)', async () => {
    const ok = await createBookingCalendarEvent(data, {
      createEvent: async () => { throw new ReauthRequiredError('biz-1', 'calendar'); },
      emit: (async () => { throw new Error('emit down'); }) as never,
    });
    assert.equal(ok, false);
  });
});
