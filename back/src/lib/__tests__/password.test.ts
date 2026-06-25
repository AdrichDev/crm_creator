import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword, PASSWORD_MIN_LENGTH } from '../password.js';

test('validatePassword rechaza contraseñas cortas (< mínimo)', () => {
  assert.equal(validatePassword('abc'), 'too_short');
  assert.equal(validatePassword('abcdefghij1'), 'too_short'); // 11 chars con variedad pero corta
});

test('validatePassword exige variedad (≥1 letra y ≥1 dígito)', () => {
  assert.equal(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH)), 'needs_variety'); // solo letras
  assert.equal(validatePassword('1'.repeat(PASSWORD_MIN_LENGTH)), 'needs_variety'); // solo dígitos
});

test('validatePassword acepta longitud mínima con letra + dígito', () => {
  assert.equal(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1) + '1'), null);
  assert.equal(validatePassword('contraseña-larga-1'), null);
});
