// Unit tests para lib/automation (firma HMAC + emisor soft-fail).
// Runner: node --import tsx --test
//
// Cubre 2.0.a:
//   - sign/verify: HMAC-SHA256 sobre `timestamp.body`, verificación timing-safe.
//   - checkEmitPrecondition: disabled/blocked_no_secret/ok.
//   - emit sin URL configurada (default en tests) → no-op suave, nunca lanza.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify } from '../automation/signer.js';
import { checkEmitPrecondition, emit, resetEmitterState } from '../automation/index.js';

describe('automation/signer — firma HMAC', () => {
  test('sign es determinista para el mismo secreto/timestamp/body', () => {
    const a = sign('secreto', 1000, '{"x":1}');
    const b = sign('secreto', 1000, '{"x":1}');
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/); // HMAC-SHA256 hex
  });

  test('verify acepta la firma correcta', () => {
    const ts = 1234567890;
    const body = '{"eventId":"e1"}';
    const sig = sign('shhh', ts, body);
    assert.equal(verify('shhh', ts, body, sig), true);
  });

  test('verify rechaza firma con secreto distinto', () => {
    const ts = 1234567890;
    const body = '{"eventId":"e1"}';
    const sig = sign('shhh', ts, body);
    assert.equal(verify('otro-secreto', ts, body, sig), false);
  });

  test('verify rechaza si cambia el timestamp (anti-replay)', () => {
    const body = '{"eventId":"e1"}';
    const sig = sign('shhh', 1000, body);
    assert.equal(verify('shhh', 2000, body, sig), false);
  });

  test('verify no lanza ante firma de longitud distinta (timing-safe)', () => {
    assert.doesNotThrow(() => {
      const r = verify('shhh', 1000, '{}', 'abc'); // longitud inválida
      assert.equal(r, false);
    });
  });
});

describe('automation/index — precondición de envío', () => {
  test('sin URL → disabled', () => {
    assert.equal(checkEmitPrecondition('', 'secreto'), 'disabled');
  });

  test('URL sin secreto → blocked_no_secret', () => {
    assert.equal(checkEmitPrecondition('https://n8n/webhook', ''), 'blocked_no_secret');
  });

  test('URL y secreto → ok', () => {
    assert.equal(checkEmitPrecondition('https://n8n/webhook', 'secreto'), 'ok');
  });
});

describe('automation/index — emit soft-fail', () => {
  // Contrato soft-fail independiente del entorno: emit NUNCA lanza y devuelve
  // un EmitResult válido (skipped/sent/failed según config). La vía no-op
  // (sin URL → disabled) queda fijada de forma determinista por checkEmitPrecondition.
  test('emit no lanza nunca y devuelve un EmitResult válido', async () => {
    resetEmitterState();
    let result: Awaited<ReturnType<typeof emit>> | undefined;
    await assert.doesNotReject(async () => {
      result = await emit('booking.confirmed', {
        bookingId: 'b1', businessName: 'Neg', customerName: 'Ana',
        email: 'a@b.com', serviceName: 'Corte', fecha: 'hoy', hora: '10:00',
      }, { businessId: 'biz-1', eventId: `soft-fail-${Date.now()}` });
    });
    assert.ok(result && ['skipped', 'sent', 'failed'].includes(result.status));
  });
});
