import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword } from '../password.js';

test('validatePassword rechaza contraseñas cortas (< mínimo)', () => {
  assert.equal(validatePassword('Ab1!'), 'too_short');        // 4 chars: 4 clases pero corta
  assert.equal(validatePassword('Abcdefghi1!'), 'too_short'); // 11 chars
});

test('validatePassword exige las 4 clases de caracteres', () => {
  assert.equal(validatePassword('abcdefghij1!'), 'needs_upper');   // sin mayúscula
  assert.equal(validatePassword('ABCDEFGHIJ1!'), 'needs_lower');   // sin minúscula
  assert.equal(validatePassword('Abcdefghijk!'), 'needs_digit');   // sin dígito
  assert.equal(validatePassword('Abcdefghij12'), 'needs_special'); // sin símbolo
});

test('validatePassword acepta ≥12 con mayúscula, minúscula, número y símbolo', () => {
  assert.equal(validatePassword('Abcdefghij1!'), null);
  assert.equal(validatePassword('Contraseña-Larga-1'), null);
});
