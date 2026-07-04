// Unit tests para lib/notify.ts (puerto de notificación con fallback).
// Runner: node --import tsx --test
//
// Cubre 2.0.b: con AUTOMATION_WEBHOOK_URL → emit(evento) y 0 sendEmail;
// sin URL → sendEmail con la plantilla actual y 0 emit. Siempre soft-fail.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  notifyBookingConfirmed,
  notifyBookingReminder,
  notifyBookingNoShow,
  type BookingNotifyData,
  type NotifyDeps,
} from '../notify.js';
import { ReauthRequiredError } from '../integrations/oauth.js';
import { ProviderError } from '../integrations/gmail.js';

// ---------------------------------------------------------------------------
// Espías inyectables: capturan las llamadas a emit y sendEmail por separado.
// ---------------------------------------------------------------------------
interface EmitCall { name: string; data: unknown; eventId?: string; businessId: string }
interface MailCall { to: string; subject: string; html: string }

function makeDeps(webhookUrl: string) {
  const emitCalls: EmitCall[] = [];
  const mailCalls: MailCall[] = [];

  const deps: NotifyDeps = {
    webhookUrl,
    emit: (async (name: string, data: unknown, opts: { businessId: string; eventId?: string }) => {
      emitCalls.push({ name, data, eventId: opts.eventId, businessId: opts.businessId });
      return { status: 'sent', eventId: opts.eventId ?? 'auto' };
    }) as NotifyDeps['emit'],
    sendEmail: async (opts: MailCall) => { mailCalls.push(opts); return true; },
  };

  return Object.assign(deps, { emitCalls, mailCalls });
}

const baseData: BookingNotifyData = {
  bookingId: 'b-1',
  businessId: 'biz-1',
  businessName: 'Peluquería Test',
  customerName: 'Ana García',
  email: 'cliente@test.com',
  serviceName: 'Corte de cabello',
  employeeName: 'Miguel Torres',
  startsAt: new Date('2026-07-10T10:00:00Z'),
};

// ---------------------------------------------------------------------------
// Confirmación
// ---------------------------------------------------------------------------
describe('notifyBookingConfirmed', () => {
  test('con URL → emit booking.confirmed, 0 sendEmail, eventId idempotente', async () => {
    const deps = makeDeps('https://n8n/webhook');
    const ok = await notifyBookingConfirmed(baseData, deps);
    assert.equal(ok, true);
    assert.equal(deps.emitCalls.length, 1);
    assert.equal(deps.mailCalls.length, 0);
    assert.equal(deps.emitCalls[0].name, 'booking.confirmed');
    assert.equal(deps.emitCalls[0].eventId, 'b-1:confirmed');
    assert.equal(deps.emitCalls[0].businessId, 'biz-1');
    // Payload minimiza PII y trae fecha/hora ya formateadas.
    const data = deps.emitCalls[0].data as Record<string, unknown>;
    assert.equal(data.email, 'cliente@test.com');
    assert.equal(data.customerName, 'Ana García');
    assert.ok(typeof data.fecha === 'string' && (data.fecha as string).length > 0);
    assert.ok(typeof data.hora === 'string' && (data.hora as string).length > 0);
  });

  test('sin URL → sendEmail con la plantilla actual, 0 emit', async () => {
    const deps = makeDeps('');
    const ok = await notifyBookingConfirmed(baseData, deps);
    assert.equal(ok, true);
    assert.equal(deps.emitCalls.length, 0);
    assert.equal(deps.mailCalls.length, 1);
    assert.equal(deps.mailCalls[0].to, 'cliente@test.com');
    assert.ok(deps.mailCalls[0].subject.includes('Cita confirmada'));
    assert.ok(deps.mailCalls[0].html.includes('Ana García'));
  });
});

// ---------------------------------------------------------------------------
// Recordatorios
// ---------------------------------------------------------------------------
describe('notifyBookingReminder', () => {
  test('con URL → emit booking.reminder.24h con eventId = id notificación', async () => {
    const deps = makeDeps('https://n8n/webhook');
    const ok = await notifyBookingReminder(baseData, '24h', 'notif-42', deps);
    assert.equal(ok, true);
    assert.equal(deps.emitCalls.length, 1);
    assert.equal(deps.mailCalls.length, 0);
    assert.equal(deps.emitCalls[0].name, 'booking.reminder.24h');
    assert.equal(deps.emitCalls[0].eventId, 'notif-42');
  });

  test('con URL y ventana 2h → emit booking.reminder.2h', async () => {
    const deps = makeDeps('https://n8n/webhook');
    await notifyBookingReminder(baseData, '2h', 'notif-43', deps);
    assert.equal(deps.emitCalls[0].name, 'booking.reminder.2h');
  });

  test('sin URL → sendEmail con subject de recordatorio', async () => {
    const deps = makeDeps('');
    const ok = await notifyBookingReminder(baseData, '24h', 'notif-42', deps);
    assert.equal(ok, true);
    assert.equal(deps.emitCalls.length, 0);
    assert.equal(deps.mailCalls.length, 1);
    assert.ok(deps.mailCalls[0].subject.includes('mañana'));
  });
});

// ---------------------------------------------------------------------------
// No-show
// ---------------------------------------------------------------------------
describe('notifyBookingNoShow', () => {
  test('con URL → emit booking.no_show con eventId idempotente por transición', async () => {
    const deps = makeDeps('https://n8n/webhook');
    const ok = await notifyBookingNoShow(baseData, deps);
    assert.equal(ok, true);
    assert.equal(deps.emitCalls.length, 1);
    assert.equal(deps.mailCalls.length, 0);
    assert.equal(deps.emitCalls[0].name, 'booking.no_show');
    assert.equal(deps.emitCalls[0].eventId, 'b-1:no_show');
  });

  test('sin URL → sendEmail con mensaje de seguimiento', async () => {
    const deps = makeDeps('');
    const ok = await notifyBookingNoShow(baseData, deps);
    assert.equal(ok, true);
    assert.equal(deps.emitCalls.length, 0);
    assert.equal(deps.mailCalls.length, 1);
    assert.ok(deps.mailCalls[0].html.includes('echamos de menos'));
  });
});

// ---------------------------------------------------------------------------
// Soft-fail: emit fallido (failed) o sendEmail false → devuelve false, no lanza.
// ---------------------------------------------------------------------------
describe('notify — soft-fail', () => {
  test('emit failed → false, sin lanzar', async () => {
    const deps: NotifyDeps = {
      webhookUrl: 'https://n8n/webhook',
      emit: (async () => ({ status: 'failed', eventId: 'x', error: 'http_500' })) as NotifyDeps['emit'],
      sendEmail: async () => true,
    };
    let ok: boolean | undefined;
    await assert.doesNotReject(async () => { ok = await notifyBookingConfirmed(baseData, deps); });
    assert.equal(ok, false);
  });

  test('emit duplicate → true (idempotente, no reintenta)', async () => {
    const deps: NotifyDeps = {
      webhookUrl: 'https://n8n/webhook',
      emit: (async () => ({ status: 'skipped', reason: 'duplicate' })) as NotifyDeps['emit'],
      sendEmail: async () => true,
    };
    const ok = await notifyBookingReminder(baseData, '24h', 'notif-1', deps);
    assert.equal(ok, true);
  });
});

// ---------------------------------------------------------------------------
// Gmail del negocio (T1.6): en la vía SMTP directa (webhook vacío) prefiere el
// Gmail conectado; ante 'missing'/reauth/proveedor cae a SMTP sin lanzar.
// ---------------------------------------------------------------------------
describe('notify — Gmail del negocio', () => {
  function makeGmailDeps(gmail: NotifyDeps['sendViaGmail'], webhookUrl = '') {
    const emitCalls: EmitCall[] = [];
    const mailCalls: MailCall[] = [];
    const deps: NotifyDeps = {
      webhookUrl,
      emit: (async (name: string, data: unknown, opts: { businessId: string; eventId?: string }) => {
        emitCalls.push({ name, data, eventId: opts.eventId, businessId: opts.businessId });
        return { status: 'sent', eventId: opts.eventId ?? 'auto' };
      }) as NotifyDeps['emit'],
      sendEmail: async (opts: MailCall) => { mailCalls.push(opts); return true; },
      sendViaGmail: gmail,
    };
    return Object.assign(deps, { emitCalls, mailCalls });
  }

  test('Gmail conectado → sent: 0 sendEmail, 0 telemetría', async () => {
    let gmailCalls = 0;
    const deps = makeGmailDeps(async () => { gmailCalls++; return 'sent'; });
    const ok = await notifyBookingConfirmed(baseData, deps);
    assert.equal(ok, true);
    assert.equal(gmailCalls, 1);
    assert.equal(deps.mailCalls.length, 0);
    assert.equal(deps.emitCalls.length, 0);
  });

  test('Gmail no conectado (missing) → fallback SMTP, sin telemetría', async () => {
    const deps = makeGmailDeps(async () => 'missing');
    const ok = await notifyBookingConfirmed(baseData, deps);
    assert.equal(ok, true);
    assert.equal(deps.mailCalls.length, 1);
    assert.equal(deps.emitCalls.length, 0);
  });

  test('ReauthRequiredError → emite integracion.reauth_requerido + fallback SMTP', async () => {
    const deps = makeGmailDeps(async () => { throw new ReauthRequiredError('biz-1', 'gmail'); });
    const ok = await notifyBookingConfirmed(baseData, deps);
    assert.equal(ok, true);
    assert.equal(deps.mailCalls.length, 1);
    assert.equal(deps.emitCalls.length, 1);
    assert.equal(deps.emitCalls[0].name, 'integracion.reauth_requerido');
    assert.equal(deps.emitCalls[0].businessId, 'biz-1');
  });

  test('ProviderError (5xx) → emite integracion.fallo_proveedor + fallback SMTP', async () => {
    const deps = makeGmailDeps(async () => { throw new ProviderError('gmail', 'http_503'); });
    const ok = await notifyBookingNoShow(baseData, deps);
    assert.equal(ok, true);
    assert.equal(deps.mailCalls.length, 1);
    assert.equal(deps.emitCalls.length, 1);
    assert.equal(deps.emitCalls[0].name, 'integracion.fallo_proveedor');
    assert.equal((deps.emitCalls[0].data as Record<string, unknown>).codigo, 'http_503');
  });

  test('webhook activo → Gmail NO se usa (n8n enruta la mensajería)', async () => {
    let gmailCalls = 0;
    const deps = makeGmailDeps(async () => { gmailCalls++; return 'sent'; }, 'https://n8n/webhook');
    const ok = await notifyBookingConfirmed(baseData, deps);
    assert.equal(ok, true);
    assert.equal(gmailCalls, 0);
    assert.equal(deps.emitCalls.length, 1);
    assert.equal(deps.emitCalls[0].name, 'booking.confirmed');
  });
});
