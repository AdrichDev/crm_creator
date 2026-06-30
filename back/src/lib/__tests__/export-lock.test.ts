/**
 * back/src/lib/__tests__/export-lock.test.ts
 *
 * Unit tests for the in-process build lock (export-lock.ts).
 * RF-07: only one export build at a time.
 * RF-08: 20-minute watchdog aborts stalled builds.
 *
 * Runner: node --import tsx --test
 */

import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { acquireLock, releaseLock, startWatchdog } from '../export-lock.js';

// Reset shared module-level lock state before each test.
beforeEach(() => releaseLock());

test('acquire cuando libre → true', () => {
  assert.equal(acquireLock(), true);
});

test('acquire cuando ya ocupado → false', () => {
  acquireLock(); // first call: lock acquired
  assert.equal(acquireLock(), false); // second call: blocked
});

test('release resetea el lock', () => {
  acquireLock();
  releaseLock();
  assert.equal(acquireLock(), true, 'debe poder adquirirse de nuevo tras release');
});

test('release es idempotente', () => {
  assert.doesNotThrow(() => {
    releaseLock();
    releaseLock();
  });
});

test('watchdog dispara, invoca onTimeout y libera el lock tras 20 minutos', () => {
  mock.timers.enable({ apis: ['setTimeout'] });

  try {
    acquireLock();
    const controller = new AbortController();
    let timedOut = false;

    startWatchdog(controller, () => {
      timedOut = true;
    });

    // Advance fake clock past the 20-minute deadline (20 * 60 * 1000 ms).
    mock.timers.tick(20 * 60 * 1000 + 1);

    assert.equal(timedOut, true, 'onTimeout debe ser invocado cuando el watchdog dispara');
    // releaseLock() is called inside the timer; a new acquireLock() must succeed.
    assert.equal(acquireLock(), true, 'el lock debe quedar libre tras el watchdog');
  } finally {
    mock.timers.reset();
  }
});
