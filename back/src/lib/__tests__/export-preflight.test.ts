/**
 * back/src/lib/__tests__/export-preflight.test.ts
 *
 * Integration tests for export-preflight.ts.
 * Uses real subprocess calls (where/which) to verify binary detection.
 * RF-09: missing required binary → ok:false with actionable message.
 *
 * Assumptions:
 *   - electron-builder is NOT installed in dev/CI (standard dev machine).
 *   - If electron-builder IS installed, test 2 will fail — which is correct behaviour
 *     (the environment has the tool, so ok:false would be wrong).
 *
 * Runner: node --import tsx --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkToolchain } from '../export-preflight.js';

test('ipa siempre retorna ok:true (guard de plataforma vive en el builder, no en preflight)', async () => {
  const result = await checkToolchain('ipa');
  assert.equal(result.ok, true, 'checkToolchain("ipa") debe ser siempre ok:true');
  assert.ok(result.message.length > 0, 'debe incluir un mensaje descriptivo');
});

test('herramienta ausente (electron-builder) → ok:false con mensaje que nombra el binario', async () => {
  // electron-builder is not installed in standard dev/CI environments.
  const result = await checkToolchain('exe');
  assert.equal(result.ok, false, 'debe indicar herramienta ausente');
  assert.match(result.message, /electron-builder/i, 'mensaje debe mencionar el binario requerido');
});

test('PreflightResult tiene forma { ok: boolean, message: string }', async () => {
  const result = await checkToolchain('ipa');
  assert.ok(typeof result.ok === 'boolean', 'ok debe ser boolean');
  assert.ok(typeof result.message === 'string', 'message debe ser string');
  assert.ok(result.message.length > 0, 'message no debe estar vacío');
});
