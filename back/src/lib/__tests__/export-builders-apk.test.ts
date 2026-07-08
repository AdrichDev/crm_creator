import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApk } from '../export-builders/apk.js';

test('buildApk stub para exportacion', async () => {
  assert.ok(typeof buildApk === 'function');
});
