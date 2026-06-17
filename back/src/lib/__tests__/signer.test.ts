import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify } from '../automation/signer.js';

const SECRET = 'test-secret';

test('verify acepta una firma válida sobre timestamp.body', () => {
  const ts = 1718000000000;
  const body = JSON.stringify({ hello: 'world' });
  const sig = sign(SECRET, ts, body);
  assert.ok(verify(SECRET, ts, body, sig));
});

test('verify rechaza firma con secreto distinto', () => {
  const ts = 1718000000000;
  const body = '{}';
  const sig = sign(SECRET, ts, body);
  assert.equal(verify('otro-secreto', ts, body, sig), false);
});

test('verify rechaza si cambia el timestamp (anti-replay)', () => {
  const body = '{}';
  const sig = sign(SECRET, 1, body);
  assert.equal(verify(SECRET, 2, body, sig), false);
});

test('verify rechaza si cambia el body', () => {
  const ts = 1;
  const sig = sign(SECRET, ts, '{"a":1}');
  assert.equal(verify(SECRET, ts, '{"a":2}', sig), false);
});

test('verify no lanza ante firma malformada', () => {
  assert.equal(verify(SECRET, 1, '{}', 'no-hex'), false);
});
