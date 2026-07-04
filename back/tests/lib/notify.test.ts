import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  notifyBookingConfirmed,
  type NotifyDeps,
} from '../../src/lib/notify.js';

// emit() real devuelve EmitResult: 'sent' | 'skipped'(reason) | 'failed'(error).
// emitDispatched cuenta 'sent' y 'skipped'+'duplicate' como despachado.
const mockDeps: NotifyDeps = {
  webhookUrl: 'https://example.com/webhook',
  emit: async () => ({ status: 'sent', eventId: 'test-123' }),
  sendEmail: async () => true,
};

const mockDepsSmtp: NotifyDeps = {
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

test('T0.1 — Via unica: webhook activa → emit() llamado y despachado', async () => {
  let emitCalled = false;
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async () => {
      emitCalled = true;
      return { status: 'sent', eventId: 'test-emit' };
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, true, 'debería devolver true');
  assert.strictEqual(emitCalled, true, 'emit debería haber sido llamado');
});

test('T0.1 — Via unica: webhook vacio → sendEmail() llamado', async () => {
  let sendEmailCalled = false;
  const deps: NotifyDeps = {
    ...mockDepsSmtp,
    sendEmail: async () => {
      sendEmailCalled = true;
      return true;
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, true, 'debería devolver true');
  assert.strictEqual(sendEmailCalled, true, 'sendEmail debería haber sido llamado');
});

test('T0.2 — Soft-fail: emit() lanza → devuelve false, no propaga', async () => {
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async () => {
      throw new Error('Network error');
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, false, 'debería devolver false en error');
});

test('T0.2 — Soft-fail: sendEmail() lanza → devuelve false, no propaga', async () => {
  const deps: NotifyDeps = {
    ...mockDepsSmtp,
    sendEmail: async () => {
      throw new Error('SMTP error');
    },
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, false, 'debería devolver false en error');
});

test('T0.2b — Soft-fail: emit() devuelve failed → false (modo real, no lanza)', async () => {
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async () => ({ status: 'failed', eventId: 'e1', error: 'http_500' }),
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, false, 'un failed no cuenta como despachado');
});

test('T0.3 — Idempotencia: emit() devuelve skipped/duplicate → cuenta como despachado', async () => {
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async () => ({ status: 'skipped', reason: 'duplicate' }),
  };
  const result = await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(result, true, 'un duplicate idempotente cuenta como enviado');
});

test('T0.4 — Payload: emit() recibe eventId idempotente y datos de negocio', async () => {
  let capturedName: string | null = null;
  let capturedOpts: any = null;
  const deps: NotifyDeps = {
    ...mockDeps,
    emit: async (name, _data, opts) => {
      capturedName = name;
      capturedOpts = opts;
      return { status: 'sent', eventId: 'test-hmac' };
    },
  };
  await notifyBookingConfirmed(testData, deps);
  assert.strictEqual(capturedName, 'booking.confirmed', 'evento correcto');
  assert.ok(capturedOpts, 'emit debería recibir opts');
  assert.strictEqual(capturedOpts.eventId, 'booking-1:confirmed', 'eventId idempotente');
  assert.strictEqual(capturedOpts.businessId, 'biz-1', 'businessId propagado');
});
