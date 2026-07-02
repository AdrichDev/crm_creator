// Unit tests para calendarFeed.ts (WU2.2 scoping, WU2.3 rango y privacidad).
// Runner: node --import tsx --test
// Estrategia: deps inyectadas (sin Prisma/DB real), igual que reminderDrainer.test.ts.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedItems, resolveFeedItems, feedRange } from '../calendarFeed.js';
import type { FeedBookingRow, FeedReminderRow, CalendarFeedDeps, FeedRange } from '../calendarFeed.js';

const NOW = new Date('2026-07-02T12:00:00Z');

function makeBooking(overrides: Partial<FeedBookingRow> = {}): FeedBookingRow {
  return {
    id: 'b1',
    startAt: new Date('2026-07-10T10:00:00Z'),
    endAt: new Date('2026-07-10T10:30:00Z'),
    service: { nombre: 'Corte de pelo' },
    customer: { nombre: 'Ana', apellido: 'García' },
    location: { direccion: 'Calle Mayor 1' },
    ...overrides,
  };
}

function makeReminder(overrides: Partial<FeedReminderRow> = {}): FeedReminderRow {
  return {
    id: 'r1',
    titulo: 'Llamar para renovar',
    fechaPrevista: new Date('2026-07-15T09:00:00Z'),
    customer: { nombre: 'Luis', apellido: 'Pérez', direccion: 'Av. Sur 5' },
    ...overrides,
  };
}

describe('feedRange', () => {
  test('rango -30/+90 días desde now (AC1)', () => {
    const range = feedRange(NOW);
    const days = (ms: number) => Math.round(ms / (24 * 60 * 60 * 1000));
    assert.equal(days(NOW.getTime() - range.from.getTime()), 30);
    assert.equal(days(range.to.getTime() - NOW.getTime()), 90);
  });
});

describe('buildFeedItems — AC1 (VEVENT con UID estable)', () => {
  test('booking → UID booking-{id}@crm', () => {
    const items = buildFeedItems([makeBooking({ id: 'abc' })], [], feedRange(NOW));
    assert.equal(items.length, 1);
    assert.equal(items[0].uid, 'booking-abc@crm');
  });

  test('reminder con fecha → UID reminder-{id}@crm', () => {
    const items = buildFeedItems([], [makeReminder({ id: 'xyz' })], feedRange(NOW));
    assert.equal(items.length, 1);
    assert.equal(items[0].uid, 'reminder-xyz@crm');
  });

  test('reminder SIN fechaPrevista se excluye (no puede ir a un calendario sin fecha)', () => {
    const items = buildFeedItems([], [makeReminder({ fechaPrevista: null })], feedRange(NOW));
    assert.equal(items.length, 0);
  });
});

describe('buildFeedItems — WU2.3 rango', () => {
  test('cita dentro del rango se incluye', () => {
    const range = feedRange(NOW);
    const items = buildFeedItems([makeBooking({ startAt: new Date('2026-07-10T10:00:00Z') })], [], range);
    assert.equal(items.length, 1);
  });

  test('cita fuera de rango (más de 90 días en el futuro) se excluye', () => {
    const range = feedRange(NOW);
    const farFuture = new Date(NOW.getTime() + 200 * 24 * 60 * 60 * 1000);
    const items = buildFeedItems([makeBooking({ startAt: farFuture, endAt: farFuture })], [], range);
    assert.equal(items.length, 0);
  });

  test('cita fuera de rango (más de 30 días en el pasado) se excluye', () => {
    const range = feedRange(NOW);
    const farPast = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
    const items = buildFeedItems([makeBooking({ startAt: farPast, endAt: farPast })], [], range);
    assert.equal(items.length, 0);
  });

  test('recordatorio fuera de rango se excluye', () => {
    const range = feedRange(NOW);
    const farFuture = new Date(NOW.getTime() + 200 * 24 * 60 * 60 * 1000);
    const items = buildFeedItems([], [makeReminder({ fechaPrevista: farFuture })], range);
    assert.equal(items.length, 0);
  });
});

describe('buildFeedItems — AC3 privacidad (solo título, cliente, fecha/hora, dirección)', () => {
  test('el ítem de booking NUNCA lleva notas comerciales (solo campos permitidos)', () => {
    const items = buildFeedItems([makeBooking()], [], feedRange(NOW));
    const item = items[0];
    const allowedKeys = new Set(['uid', 'title', 'start', 'end', 'description', 'location']);
    for (const key of Object.keys(item)) assert.ok(allowedKeys.has(key), `campo inesperado: ${key}`);
    // La descripción es SOLO el nombre del cliente, nunca texto libre de notas.
    assert.equal(item.description, 'Ana García');
    assert.equal(item.location, 'Calle Mayor 1');
  });

  test('el ítem de reminder NUNCA expone descripcion/texto libre — solo cliente asociado', () => {
    const items = buildFeedItems([], [makeReminder()], feedRange(NOW));
    const item = items[0];
    assert.equal(item.description, 'Luis Pérez');
    assert.equal(item.location, 'Av. Sur 5');
    assert.equal(item.title, 'Llamar para renovar');
  });

  test('sin cliente asociado, description/location quedan undefined (no error)', () => {
    const items = buildFeedItems([makeBooking({ customer: null, location: null })], [], feedRange(NOW));
    assert.equal(items[0].description, undefined);
    assert.equal(items[0].location, undefined);
  });
});

describe('resolveFeedItems — WU2.2 aislamiento cross-user/cross-tenant', () => {
  // Simula un almacén con datos de DOS usuarios (de negocios distintos); el "repo"
  // filtra por userId como haría la query real de Prisma (employee.userId / responsableId).
  function makeTwoUserStore(): CalendarFeedDeps {
    const store: Record<string, { bookings: FeedBookingRow[]; reminders: FeedReminderRow[] }> = {
      'user-a': {
        bookings: [makeBooking({ id: 'a-booking' })],
        reminders: [makeReminder({ id: 'a-reminder' })],
      },
      'user-b': {
        bookings: [makeBooking({ id: 'b-booking' })],
        reminders: [makeReminder({ id: 'b-reminder' })],
      },
    };
    return {
      findBookingsForUser: async (userId: string, _range: FeedRange) => store[userId]?.bookings ?? [],
      findRemindersForUser: async (userId: string, _range: FeedRange) => store[userId]?.reminders ?? [],
    };
  }

  test('GET feed del usuario A solo trae ítems de A', async () => {
    const deps = makeTwoUserStore();
    const items = await resolveFeedItems(deps, 'user-a', feedRange(NOW));
    const uids = items.map((i) => i.uid).sort();
    assert.deepEqual(uids, ['booking-a-booking@crm', 'reminder-a-reminder@crm']);
  });

  test('GET feed del usuario B solo trae ítems de B (ninguno de A)', async () => {
    const deps = makeTwoUserStore();
    const items = await resolveFeedItems(deps, 'user-b', feedRange(NOW));
    const uids = items.map((i) => i.uid).sort();
    assert.deepEqual(uids, ['booking-b-booking@crm', 'reminder-b-reminder@crm']);
  });

  test('usuario sin datos → feed vacío, sin error', async () => {
    const deps = makeTwoUserStore();
    const items = await resolveFeedItems(deps, 'user-desconocido', feedRange(NOW));
    assert.deepEqual(items, []);
  });
});
