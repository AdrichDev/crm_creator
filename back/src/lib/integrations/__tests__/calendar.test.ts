// Unit tests para lib/integrations/calendar.ts (Google Calendar del negocio, WU3).
// Runner: node --import tsx --test. Sin red ni credencial real: getToken + fetch inyectados.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listCalendarEventsWithToken,
  linkEventToBookingWithToken,
  createBookingCalendarEvent,
  updateBookingCalendarEvent,
  cancelBookingCalendarEvent,
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

/** Mock de fetch secuenciado: respuesta N para la llamada N (búsqueda + acción, WU2). */
function fetchSeq(responses: { status: number; body?: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const r = responses[calls.length] ?? { status: 500 };
    calls.push({ url, init });
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return Object.assign(fn, { calls });
}

/** Evento activo de Google enlazado a bk-1 (shape mínimo que consume el módulo). */
const linkedEvent: GoogleCalendarEvent = {
  id: 'gev-7',
  status: 'confirmed',
  extendedProperties: { private: { [CRM_BOOKING_ID_KEY]: 'bk-1' } },
};

const newEvent = {
  summary: 'Corte de pelo — María',
  start: new Date('2026-07-10T09:00:00.000Z'),
  end: new Date('2026-07-10T09:30:00.000Z'),
  crmBookingId: 'bk-1',
  businessId: 'biz-1',
};

describe('createCalendarEvent (idempotente por bookingId, WU2)', () => {
  test('sin evento previo → busca por crmBookingId, POST y created con eventId', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [] } },       // búsqueda idempotencia: vacío
      { status: 200, body: { id: 'gev-99' } },    // POST crea
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok-1', fetch: fetchSpy };

    const result = await createCalendarEvent(newEvent, deps);

    assert.deepEqual(result, { status: 'created', eventId: 'gev-99' });
    assert.equal(fetchSpy.calls.length, 2);
    // 1ª llamada: búsqueda por la etiqueta privada crmBookingId=bk-1.
    assert.match(fetchSpy.calls[0].url, /privateExtendedProperty=crmBookingId%3Dbk-1/);
    // 2ª llamada: POST del evento con Bearer + etiquetas privadas.
    assert.match(fetchSpy.calls[1].url, /calendars\/primary\/events$/);
    assert.equal(fetchSpy.calls[1].init!.method, 'POST');
    const headers = fetchSpy.calls[1].init!.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer tok-1');
    const sent = JSON.parse(fetchSpy.calls[1].init!.body as string);
    assert.equal(sent.extendedProperties.private[CRM_BOOKING_ID_KEY], 'bk-1');
    assert.equal(sent.extendedProperties.private[CRM_BUSINESS_ID_KEY], 'biz-1');
    assert.equal(sent.start.dateTime, '2026-07-10T09:00:00'); // naive local (sin Z)
    assert.equal(sent.start.timeZone, 'Europe/Madrid'); // TZ explícita → Google coloca la hora de pared
  });

  test('idempotencia: evento activo ya enlazado → exists, SIN segundo POST', async () => {
    const fetchSpy = fetchSeq([{ status: 200, body: { items: [linkedEvent] } }]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };

    const result = await createCalendarEvent(newEvent, deps);

    assert.deepEqual(result, { status: 'exists', eventId: 'gev-7' });
    assert.equal(fetchSpy.calls.length, 1); // solo la búsqueda: Google ve UNA sola cita
  });

  test('evento previo cancelado no bloquea: se crea uno nuevo', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [{ ...linkedEvent, status: 'cancelled' }] } },
      { status: 200, body: { id: 'gev-new' } },
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };
    const result = await createCalendarEvent(newEvent, deps);
    assert.deepEqual(result, { status: 'created', eventId: 'gev-new' });
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

describe('updateCalendarEvent (WU2)', () => {
  test('evento encontrado → PATCH sobre su eventId con los datos nuevos', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [linkedEvent] } },  // búsqueda por bookingId
      { status: 200, body: {} },                        // PATCH
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };

    const result = await updateCalendarEvent(newEvent, deps);

    assert.deepEqual(result, { status: 'updated', eventId: 'gev-7' });
    assert.match(fetchSpy.calls[1].url, /events\/gev-7$/);
    assert.equal(fetchSpy.calls[1].init!.method, 'PATCH');
    const sent = JSON.parse(fetchSpy.calls[1].init!.body as string);
    assert.equal(sent.start.dateTime, '2026-07-10T09:00:00'); // naive local (sin Z)
    assert.equal(sent.start.timeZone, 'Europe/Madrid'); // TZ explícita → Google coloca la hora de pared
    assert.equal(sent.extendedProperties.private[CRM_BOOKING_ID_KEY], 'bk-1');
  });

  test('evento no encontrado → upsert: POST y created (la edición nunca se pierde)', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [] } },
      { status: 200, body: { id: 'gev-heal' } },
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };
    const result = await updateCalendarEvent(newEvent, deps);
    assert.deepEqual(result, { status: 'created', eventId: 'gev-heal' });
    assert.equal(fetchSpy.calls[1].init!.method, 'POST');
  });

  test('negocio sin Calendar → missing', async () => {
    const deps: CalendarDeps = {
      getToken: async () => { throw new IntegrationMissingError('biz-1', 'calendar'); },
      fetch: fetchStub(200),
    };
    assert.deepEqual(await updateCalendarEvent(newEvent, deps), { status: 'missing' });
  });

  test('401 en el PATCH → ReauthRequiredError', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [linkedEvent] } },
      { status: 401 },
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };
    await assert.rejects(() => updateCalendarEvent(newEvent, deps), ReauthRequiredError);
  });
});

describe('deleteCalendarEvent (WU2)', () => {
  test('evento encontrado → DELETE sobre su eventId → deleted', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [linkedEvent] } },
      { status: 204 },
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };

    const result = await deleteCalendarEvent('biz-1', 'bk-1', deps);

    assert.deepEqual(result, { status: 'deleted', eventId: 'gev-7' });
    assert.match(fetchSpy.calls[1].url, /events\/gev-7$/);
    assert.equal(fetchSpy.calls[1].init!.method, 'DELETE');
  });

  test('sin evento activo → not_found sin DELETE (borrar dos veces es idempotente)', async () => {
    const fetchSpy = fetchSeq([{ status: 200, body: { items: [] } }]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };
    const result = await deleteCalendarEvent('biz-1', 'bk-1', deps);
    assert.deepEqual(result, { status: 'not_found' });
    assert.equal(fetchSpy.calls.length, 1);
  });

  test('410 en el DELETE (ya borrado en vuelo) → deleted igualmente', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [linkedEvent] } },
      { status: 410 },
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };
    const result = await deleteCalendarEvent('biz-1', 'bk-1', deps);
    assert.deepEqual(result, { status: 'deleted', eventId: 'gev-7' });
  });

  test('negocio sin Calendar → missing', async () => {
    const deps: CalendarDeps = {
      getToken: async () => { throw new IntegrationMissingError('biz-1', 'calendar'); },
      fetch: fetchStub(200),
    };
    assert.deepEqual(await deleteCalendarEvent('biz-1', 'bk-1', deps), { status: 'missing' });
  });

  test('5xx en el DELETE → ProviderError', async () => {
    const fetchSpy = fetchSeq([
      { status: 200, body: { items: [linkedEvent] } },
      { status: 500 },
    ]);
    const deps: CalendarDeps = { getToken: async () => 'tok', fetch: fetchSpy };
    await assert.rejects(
      () => deleteCalendarEvent('biz-1', 'bk-1', deps),
      (err: unknown) => err instanceof ProviderError && err.codigo === 'http_500',
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

  test('exists (idempotencia: reintento del mismo bookingId) → true, sin telemetría', async () => {
    const emits: string[] = [];
    const ok = await createBookingCalendarEvent(data, {
      createEvent: async () => ({ status: 'exists', eventId: 'g1' }),
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, true);
    assert.deepEqual(emits, []);
  });
});

describe('updateBookingCalendarEvent (WU2 soft-fail)', () => {
  const data = {
    businessId: 'biz-1', bookingId: 'bk-1', summary: 'Cita',
    start: new Date('2026-07-10T10:00:00.000Z'), end: new Date('2026-07-10T10:30:00.000Z'),
  };

  test('updated → true; created (upsert) → true', async () => {
    for (const status of ['updated', 'created'] as const) {
      const ok = await updateBookingCalendarEvent(data, {
        updateEvent: async () => ({ status, eventId: 'g1' }),
        emit: (async () => ({ status: 'sent' })) as never,
      });
      assert.equal(ok, true);
    }
  });

  test('missing → false, sin telemetría', async () => {
    const emits: string[] = [];
    const ok = await updateBookingCalendarEvent(data, {
      updateEvent: async () => ({ status: 'missing' }),
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, false);
    assert.deepEqual(emits, []);
  });

  test('ReauthRequiredError → false + telemetría; NUNCA lanza', async () => {
    const emits: string[] = [];
    const ok = await updateBookingCalendarEvent(data, {
      updateEvent: async () => { throw new ReauthRequiredError('biz-1', 'calendar'); },
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, false);
    assert.deepEqual(emits, ['integracion.reauth_requerido']);
  });
});

describe('cancelBookingCalendarEvent (WU2 soft-fail)', () => {
  const data = { businessId: 'biz-1', bookingId: 'bk-1' };

  test('deleted → true; not_found (segunda cancelación) → true', async () => {
    const okDeleted = await cancelBookingCalendarEvent(data, {
      deleteEvent: async () => ({ status: 'deleted', eventId: 'g1' }),
      emit: (async () => ({ status: 'sent' })) as never,
    });
    const okNotFound = await cancelBookingCalendarEvent(data, {
      deleteEvent: async () => ({ status: 'not_found' }),
      emit: (async () => ({ status: 'sent' })) as never,
    });
    assert.equal(okDeleted, true);
    assert.equal(okNotFound, true);
  });

  test('missing → false, sin telemetría', async () => {
    const emits: string[] = [];
    const ok = await cancelBookingCalendarEvent(data, {
      deleteEvent: async () => ({ status: 'missing' }),
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, false);
    assert.deepEqual(emits, []);
  });

  test('ProviderError → false + telemetría integracion.fallo_proveedor; NUNCA lanza', async () => {
    const emits: string[] = [];
    const ok = await cancelBookingCalendarEvent(data, {
      deleteEvent: async () => { throw new ProviderError('calendar', 'http_500'); },
      emit: (async (name: string) => { emits.push(name); return { status: 'sent' }; }) as never,
    });
    assert.equal(ok, false);
    assert.deepEqual(emits, ['integracion.fallo_proveedor']);
  });
});
