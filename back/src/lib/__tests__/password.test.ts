import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword, generateAuthToken, hashToken, PASSWORD_MIN_LENGTH, TOKEN_TTL_MS } from '../password.js';

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

test('generateAuthToken produce token alto en entropía y su hash sha256', () => {
  const { token, tokenHash } = generateAuthToken();
  // 32 bytes base64url ≈ 43 chars.
  assert.ok(token.length >= 40);
  assert.equal(tokenHash, hashToken(token));
  // El hash es de 64 hex chars (SHA-256) y NO contiene el token en claro.
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
  assert.ok(!tokenHash.includes(token));
});

test('generateAuthToken nunca repite token', () => {
  const a = generateAuthToken().token;
  const b = generateAuthToken().token;
  assert.notEqual(a, b);
});

test('hashToken es determinista', () => {
  assert.equal(hashToken('xyz'), hashToken('xyz'));
  assert.notEqual(hashToken('xyz'), hashToken('xyz2'));
});

test('TTL de reset es más corto que el de invitación', () => {
  assert.ok(TOKEN_TTL_MS.reset < TOKEN_TTL_MS.invite);
  assert.equal(TOKEN_TTL_MS.reset, 30 * 60 * 1000);
});
