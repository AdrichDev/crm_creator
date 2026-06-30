/**
 * back/src/lib/__tests__/export-builders-ipa.test.ts
 *
 * Unit tests for the IPA builder stub (export-builders/ipa.ts).
 * RF-06: IPA on non-macOS → immediate format-error event, no process started, no FS access.
 *
 * The test overrides process.platform to 'win32' so it runs correctly on any host,
 * including macOS CI machines.
 *
 * Runner: node --import tsx --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIpa } from '../export-builders/ipa.js';

type EventShape = { type: string; format?: string; message?: string };

/** Temporarily sets process.platform and returns the original descriptor. */
function overridePlatform(value: string): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
    writable: false,
    enumerable: true,
  });
  return descriptor;
}

/** Restores process.platform from a previously saved descriptor. */
function restorePlatform(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(process, 'platform', descriptor);
  }
}

test('en win32: emite un evento format-error con format "ipa" y retorna success:false', async () => {
  const saved = overridePlatform('win32');
  const events: EventShape[] = [];
  let result: { success: boolean } | undefined;

  try {
    result = await buildIpa((e) => events.push(e as EventShape));
  } finally {
    restorePlatform(saved);
  }

  assert.ok(result !== undefined, 'buildIpa debe retornar un resultado');
  assert.equal(result.success, false, 'success debe ser false en no-darwin');
  assert.equal(events.length, 1, 'debe emitir exactamente un evento');
  assert.equal(events[0].type, 'format-error', 'tipo de evento debe ser "format-error"');
  assert.equal(events[0].format, 'ipa', 'formato del evento debe ser "ipa"');
});

test('en win32: el mensaje del evento menciona macOS', async () => {
  const saved = overridePlatform('win32');
  const events: EventShape[] = [];

  try {
    await buildIpa((e) => events.push(e as EventShape));
  } finally {
    restorePlatform(saved);
  }

  assert.match(
    events[0]?.message ?? '',
    /macOS/i,
    'mensaje debe indicar que se requiere macOS',
  );
});

test('buildIpa no lanza excepción en no-darwin', async () => {
  const saved = overridePlatform('win32');
  try {
    await assert.doesNotReject(() => buildIpa(() => {}));
  } finally {
    restorePlatform(saved);
  }
});
