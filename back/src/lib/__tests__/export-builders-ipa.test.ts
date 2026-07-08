import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIpa } from '../export-builders/ipa.js';

test('buildIpa stub para exportacion', async () => {
  assert.ok(typeof buildIpa === 'function');
});
