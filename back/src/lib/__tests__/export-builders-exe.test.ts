import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExe } from '../export-builders/exe.js';

test('buildExe stub para exportacion', async () => {
  assert.ok(typeof buildExe === 'function');
});
