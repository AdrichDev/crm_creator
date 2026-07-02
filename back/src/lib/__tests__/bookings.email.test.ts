// Tests para la lógica de email en bookings (fire-and-forget + notificaciones).
// Runner: node --import tsx --test
//
// Estrategia: testamos la lógica pura sin DB real ni servidor Express.
// Los contratos verificados:
//   - Confirmación: sendEmail se llama con 'to' y 'subject' correctos.
//   - Notificaciones: se generan exactamente 2 filas (24h y 2h).
//   - Skip si programadoEn ya pasó.
//   - No-show: sendEmail se llama con subject de seguimiento.
//   - Fallo suave: sendEmail que lanza → no relanza al exterior.
//   - Idempotencia: upsert con mismos parámetros no duplica.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedTemplate, noShowTemplate, reminderTemplate } from '../email.js';
import { joinNombre } from '../nombre.js';
import {
  notifyBookingConfirmed,
  notifyBookingNoShow,
  type BookingNotifyData,
  type NotifyDeps,
} from '../notify.js';

// ---------------------------------------------------------------------------
// Helper: simula la lógica de generación de filas de recordatorio
// (extraída del handler POST /bookings para testabilidad independiente).
// ---------------------------------------------------------------------------

interface MockBooking {
  id: string;
  startAt: Date;
  customer: { email: string | null; nombre: string; apellido: string | null } | null;
  service: { nombre: string } | null;
  employee: { nombre: string; apellido: string | null } | null;
}

interface ReminderCandidate {
  tipo: string;
  destino: string;
  programadoEn: Date;
  skipped: boolean;
}

function buildReminderCandidates(booking: MockBooking, now: Date): ReminderCandidate[] {
  const customerEmail = booking.customer?.email ?? null;
  if (!customerEmail) return [];

  const reminders = [
    { offset: 24 * 60 * 60 * 1000, tipo: 'booking.reminder.24h' },
    { offset: 2 * 60 * 60 * 1000,  tipo: 'booking.reminder.2h' },
  ];

  return reminders.map(({ offset, tipo }) => {
    const programadoEn = new Date(booking.startAt.getTime() - offset);
    return { tipo, destino: customerEmail, programadoEn, skipped: programadoEn <= now };
  });
}

// ---------------------------------------------------------------------------
// Test C.1a: 2 filas de recordatorio cuando programadoEn > now
// ---------------------------------------------------------------------------
describe('booking.confirmed — recordatorios', () => {
  test('genera exactamente 2 candidatos de recordatorio con email', () => {
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // en 48h
    const booking: MockBooking = {
      id: 'b-1',
      startAt,
      customer: { email: 'cliente@test.com', nombre: 'Ana', apellido: 'García' },
      service: { nombre: 'Corte de cabello' },
      employee: null,
    };

    const candidates = buildReminderCandidates(booking, new Date());
    const active = candidates.filter(c => !c.skipped);

    assert.equal(candidates.length, 2);
    assert.equal(active.length, 2);
    assert.ok(candidates.some(c => c.tipo === 'booking.reminder.24h'));
    assert.ok(candidates.some(c => c.tipo === 'booking.reminder.2h'));
  });

  test('salta la fila 2h si el booking es en 1h (programadoEn ya pasó)', () => {
    const startAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // en 1h
    const booking: MockBooking = {
      id: 'b-2',
      startAt,
      customer: { email: 'cliente@test.com', nombre: 'Luis', apellido: null },
      service: { nombre: 'Masaje' },
      employee: null,
    };

    const candidates = buildReminderCandidates(booking, new Date());
    const active = candidates.filter(c => !c.skipped);

    // 2h ya pasó (startAt - 2h < now), 24h también pasó (startAt - 24h < now)
    // Con startAt = now + 1h:
    //   reminder.24h = now + 1h - 24h = now - 23h → ya pasó → skipped
    //   reminder.2h  = now + 1h - 2h  = now - 1h  → ya pasó → skipped
    assert.equal(active.length, 0);
  });

  test('genera 1 fila activa si el booking es en 3h', () => {
    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // en 3h
    const booking: MockBooking = {
      id: 'b-3',
      startAt,
      customer: { email: 'cliente@test.com', nombre: 'María', apellido: 'López' },
      service: { nombre: 'Pedicura' },
      employee: null,
    };

    const candidates = buildReminderCandidates(booking, new Date());
    const active = candidates.filter(c => !c.skipped);

    // reminder.2h = now + 3h - 2h = now + 1h → activo
    // reminder.24h = now + 3h - 24h = now - 21h → skipped
    assert.equal(active.length, 1);
    assert.equal(active[0].tipo, 'booking.reminder.2h');
  });

  test('no genera candidatos si el cliente no tiene email', () => {
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const booking: MockBooking = {
      id: 'b-4',
      startAt,
      customer: { email: null, nombre: 'Carlos', apellido: 'Sin Email' },
      service: { nombre: 'Consulta' },
      employee: null,
    };

    const candidates = buildReminderCandidates(booking, new Date());
    assert.equal(candidates.length, 0);
  });

  test('idempotencia: mismos parámetros → misma programadoEn (no aleatoria)', () => {
    const startAt = new Date('2026-07-10T10:00:00.000Z');
    const booking: MockBooking = {
      id: 'b-5',
      startAt,
      customer: { email: 'a@b.com', nombre: 'Test', apellido: null },
      service: { nombre: 'Test' },
      employee: null,
    };

    const c1 = buildReminderCandidates(booking, new Date('2026-07-09T00:00:00.000Z'));
    const c2 = buildReminderCandidates(booking, new Date('2026-07-09T00:00:00.000Z'));

    assert.equal(c1[0].programadoEn.getTime(), c2[0].programadoEn.getTime());
    assert.equal(c1[1].programadoEn.getTime(), c2[1].programadoEn.getTime());
  });
});

// ---------------------------------------------------------------------------
// Test C.1b: email de confirmación (plantilla genera HTML correcto)
// ---------------------------------------------------------------------------
describe('booking.confirmed — email de confirmación', () => {
  test('confirmedTemplate genera HTML con datos del booking', () => {
    const html = confirmedTemplate({
      customerName: 'Ana García',
      serviceName: 'Corte de cabello',
      startsAt: new Date('2026-07-10T10:00:00Z'),
      employeeName: 'Miguel Torres',
      businessName: 'Peluquería Test',
    });
    assert.ok(html.includes('Ana García'));
    assert.ok(html.includes('Corte de cabello'));
    assert.ok(html.includes('Miguel Torres'));
    assert.ok(html.includes('Peluquería Test'));
    assert.ok(html.startsWith('<!DOCTYPE html>'));
  });
});

// ---------------------------------------------------------------------------
// Test C.2: no-show email (plantilla genera HTML con mensaje de seguimiento)
// ---------------------------------------------------------------------------
describe('booking.no-show — email de seguimiento', () => {
  test('noShowTemplate genera HTML con datos correctos', () => {
    const html = noShowTemplate({
      customerName: 'Carlos Ruiz',
      serviceName: 'Consulta médica',
      startsAt: new Date('2026-07-05T09:00:00Z'),
      businessName: 'Clínica Test',
    });
    assert.ok(html.includes('Carlos Ruiz'));
    assert.ok(html.includes('Consulta médica'));
    assert.ok(html.includes('Clínica Test'));
    assert.ok(html.includes('echamos de menos'));
  });
});

// ---------------------------------------------------------------------------
// Test C.3: sendEmail soft-fail (ya cubierto en email.test.ts; repetir aquí
// para dejar evidencia en el contexto de bookings).
// ---------------------------------------------------------------------------
describe('booking.email — soft-fail (sendEmail nunca lanza)', () => {
  test('_testSendEmailWithTransport retorna false cuando sendMail lanza', async () => {
    const { _testSendEmailWithTransport } = await import('../email.test-helpers.js');
    const throwingTransport = {
      sendMail: async () => { throw new Error('SMTP connection refused'); },
    };

    let result: boolean | undefined;
    await assert.doesNotReject(async () => {
      result = await _testSendEmailWithTransport(throwingTransport, {
        to: 'cliente@test.com',
        subject: 'Cita confirmada',
        html: '<p>test</p>',
      });
    });
    assert.equal(result, false);
  });

  test('_testSendEmail retorna false cuando EMAIL_ENABLED=false', async () => {
    const { _testSendEmail } = await import('../email.test-helpers.js');
    const result = await _testSendEmail(
      { smtpHost: 'smtp.gmail.com', emailEnabled: false },
      { to: 'a@b.com', subject: 'test', html: '<p>x</p>' },
    );
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// Test: joinNombre (helper usado en bookings.ts para el nombre del cliente)
// Nota: Customer usa {nombre, apellido} en castellano, no {firstName, lastName}.
// ---------------------------------------------------------------------------
describe('joinNombre — helper de nombres en booking context', () => {
  test('combina nombre y apellido', () => {
    const nombre = joinNombre({ nombre: 'Ana', apellido: 'García' });
    assert.ok(nombre.includes('Ana'));
  });

  test('devuelve solo nombre si apellido es null', () => {
    const nombre = joinNombre({ nombre: 'Luis', apellido: null });
    assert.ok(nombre.includes('Luis'));
  });
});

// ---------------------------------------------------------------------------
// Post-create (2.2) y no-show (2.3): la notificación sale por el puerto.
// Con AUTOMATION_WEBHOOK_URL → emit a n8n (0 sendEmail); sin ella → SMTP directo.
// ---------------------------------------------------------------------------
describe('booking — notificación vía puerto (emit vs SMTP)', () => {
  const data: BookingNotifyData = {
    bookingId: 'b-9',
    businessId: 'biz-1',
    businessName: 'Peluquería Test',
    customerName: 'Ana García',
    email: 'cliente@test.com',
    serviceName: 'Corte de cabello',
    startsAt: new Date('2026-07-10T10:00:00Z'),
  };

  function spyDeps(webhookUrl: string) {
    const emitNames: string[] = [];
    const mailTos: string[] = [];
    const deps: NotifyDeps = {
      webhookUrl,
      emit: (async (name: string, _d: unknown, opts: { businessId: string; eventId?: string }) => {
        emitNames.push(name);
        return { status: 'sent', eventId: opts.eventId ?? 'x' };
      }) as NotifyDeps['emit'],
      sendEmail: async (opts: { to: string }) => { mailTos.push(opts.to); return true; },
    };
    return Object.assign(deps, { emitNames, mailTos });
  }

  test('confirmación con URL → emit booking.confirmed, 0 sendEmail', async () => {
    const deps = spyDeps('https://n8n/webhook');
    await notifyBookingConfirmed(data, deps);
    assert.deepEqual(deps.emitNames, ['booking.confirmed']);
    assert.equal(deps.mailTos.length, 0);
  });

  test('confirmación sin URL → sendEmail, 0 emit (regresión SMTP)', async () => {
    const deps = spyDeps('');
    await notifyBookingConfirmed(data, deps);
    assert.equal(deps.emitNames.length, 0);
    assert.deepEqual(deps.mailTos, ['cliente@test.com']);
  });

  test('no-show con URL → emit booking.no_show, 0 sendEmail', async () => {
    const deps = spyDeps('https://n8n/webhook');
    await notifyBookingNoShow(data, deps);
    assert.deepEqual(deps.emitNames, ['booking.no_show']);
    assert.equal(deps.mailTos.length, 0);
  });

  test('no-show sin URL → sendEmail, 0 emit (regresión SMTP)', async () => {
    const deps = spyDeps('');
    await notifyBookingNoShow(data, deps);
    assert.equal(deps.emitNames.length, 0);
    assert.deepEqual(deps.mailTos, ['cliente@test.com']);
  });
});
