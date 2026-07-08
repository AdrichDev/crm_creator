import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkToolchain } from '../export-preflight.js';

test('export-preflight (SaaS puro) siempre devuelve ok: true', async () => {
  const res = await checkToolchain("apk", "/tmp/front", {});
  assert.equal(res.ok, true);
  assert.deepEqual(res.missing, []);
});
