// Unit tests para lib/crypto.ts (AES-256-GCM, credenciales OAuth del CRM).
// Runner: node --import tsx --test
//
// Cubre: round-trip encrypt/decrypt, authTag manipulado lanza, clave distinta lanza,
// clave ausente/inválida lanza.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../crypto.js';

// Dos claves de 32 bytes válidas (hex de 64 chars) para probar mismatch.
const KEY_A = randomBytes(32).toString('hex');
const KEY_B = randomBytes(32).toString('hex');

function setKey(k: string) { process.env.CRM_OAUTH_ENCRYPTION_KEY = k; }

describe('crypto — round-trip', () => {
  beforeEach(() => setKey(KEY_A));

  test('encrypt→decrypt devuelve el texto original', () => {
    const secret = 'ya29.a0AfH-token-de-acceso-largo';
    const payload = encrypt(secret);
    assert.equal(decrypt(payload), secret);
  });

  test('cada encrypt usa un IV distinto (no determinista)', () => {
    const a = encrypt('mismo-texto');
    const b = encrypt('mismo-texto');
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.data, b.data);
  });

  test('soporta clave en base64 además de hex', () => {
    setKey(randomBytes(32).toString('base64'));
    const payload = encrypt('con-clave-base64');
    assert.equal(decrypt(payload), 'con-clave-base64');
  });
});

describe('crypto — integridad', () => {
  beforeEach(() => setKey(KEY_A));

  test('authTag manipulado → decrypt lanza', () => {
    const payload = encrypt('dato-sensible');
    const tampered = { ...payload, authTag: 'ff'.repeat(16) };
    assert.throws(() => decrypt(tampered));
  });

  test('ciphertext manipulado → decrypt lanza (GCM detecta)', () => {
    const payload = encrypt('dato-sensible');
    const flipped = payload.data.slice(0, -2) + (payload.data.endsWith('0') ? '1' : '0');
    assert.throws(() => decrypt({ ...payload, data: flipped }));
  });

  test('clave distinta → decrypt lanza', () => {
    const payload = encrypt('cifrado-con-A');
    setKey(KEY_B);
    assert.throws(() => decrypt(payload));
  });
});

describe('crypto — configuración de clave', () => {
  test('sin CRM_OAUTH_ENCRYPTION_KEY → lanza', () => {
    delete process.env.CRM_OAUTH_ENCRYPTION_KEY;
    assert.throws(() => encrypt('x'), /CRM_OAUTH_ENCRYPTION_KEY no definida/);
  });

  test('clave de longitud incorrecta → lanza', () => {
    setKey('demasiado-corta');
    assert.throws(() => encrypt('x'), /debe ser 32 bytes/);
  });
});
