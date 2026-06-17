import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { consume, resetRateLimits } from '../rateLimit.js';

beforeEach(() => resetRateLimits());

test('permite hasta el máximo y luego bloquea', () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) assert.ok(consume('login', 'ip1', 60_000, 3, now));
  assert.equal(consume('login', 'ip1', 60_000, 3, now), false);
});

test('la ventana se reinicia tras expirar', () => {
  const start = 1_000_000;
  for (let i = 0; i < 3; i++) consume('forgot', 'ip2', 1000, 3, start);
  assert.equal(consume('forgot', 'ip2', 1000, 3, start), false);
  // Pasado el windowMs, vuelve a permitir.
  assert.ok(consume('forgot', 'ip2', 1000, 3, start + 1001));
});

test('buckets distintos no comparten contador', () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) consume('login', 'ip3', 60_000, 3, now);
  // Otro bucket con la misma clave sigue libre.
  assert.ok(consume('forgot', 'ip3', 60_000, 3, now));
});

test('claves distintas no comparten contador', () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) consume('login', 'ipA', 60_000, 3, now);
  assert.ok(consume('login', 'ipB', 60_000, 3, now));
});
