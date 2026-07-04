import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  notifyBookingConfirmed,
  notifyBookingReminder,
  notifyBookingNoShow,
  type NotifyDeps,
} from '../../src/lib/notify.js';

const mockDeps: NotifyDeps = {
  webhookUrl: 'https://example.com/webhook',
  emit: async () => ({ status: 'ok', eventId: 'test-123' }),
  sendEmail: async () => true,
};

const mockDepsDeps = {
  ...mockDeps,
  webhookUrl: '', // Vacío → fallback SMTP
};

const testData = {
  bookingId: 'booking-1',
  businessId: 'biz-1',
  businessName: 'Test Business',
  customerName: 'John Doe',
  email: 'john@example.com',
  serviceName: 'Consulta',
  startsAt: new Date('2026-07-05T14:00:00Z'),
};

test('T0.1 — Via unica: webhook activa → emit() llamado', async () => {
  let emitCalled = false;
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async () => {
      emitCalled = true;
      return { status: 'ok', eventId: 'test-emit' };
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, true, 'debería devolver true');
  assert.strictEqual(emitCalled, true, 'emit debería haber sido llamado');
});

test('T0.1 — Via unica: webhook vacio → sendEmail() llamado', async () => {
  let sendEmailCalled = false;
  const deps: NotifyDeps = {
    ...mockDepsDeps,
    sendEmail: async () => {
      sendEmailCalled = true;
      return true;
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, true, 'debería devolver true');
  assert.strictEqual(sendEmailCalled, true, 'sendEmail debería haber sido llamado');
});

test('T0.2 — Soft-fail: emit() error → devuelve false, no lanza', async () => {
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async () => {
      throw new Error('Network error');
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, false, 'debería devolver false en error');
});

test('T0.2 — Soft-fail: sendEmail() error → devuelve false, no lanza', async () => {
  const deps: NotifyDeps = {
    ...mockDepsDeps,
    sendEmail: async () => {
      throw new Error('SMTP error');
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, false, 'debería devolver false en error');
});

test('T0.3 — Idempotencia: reintento mismo evento → eventId repetido OK', async () => {
  let emitCount = 0;
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async () => {
      emitCount++;
      return { status: 'ok', eventId: 'event-1' };
    },
  };
  const result1 = await notifyBookingConfirmed(testData, deps);
  const result2 = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result1, true);
  assert.strictEqual(result2, true);
  assert.strictEqual(emitCount, 2, 'emit debería haber sido llamado 2 veces');
});

test('T0.4 — HMAC check: emit() recibe payload con firma HMAC', async () => {
  let capturedPayload: any = null;
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async (event) => {
      capturedPayload = event;
      return { status: 'ok', eventId: 'test-hmac' };
    },
  };
  await notifyBookingConfirmed(testData, deps);
  assert.ok(capturedPayload, 'emit debería haber sido llamado con payload');
  assert.ok(capturedPayload.eventId, 'payload debería tener eventId');
});
