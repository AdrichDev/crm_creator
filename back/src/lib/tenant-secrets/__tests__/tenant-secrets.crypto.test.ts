// Unit tests para lib/tenant-secrets/crypto.ts (AES-256-GCM, TenantSecret).
// Runner: node --import tsx --test
//
// Cubre: round-trip encrypt/decrypt, authTag manipulado lanza, rotación de clave
// maestra (cross-version: keyVersion 1 sigue descifrando tras publicar la v2),
// clave ausente/inválida lanza.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret, currentKeyVersion } from '../crypto.js';

const KEY_V1 = randomBytes(32).toString('hex');
const KEY_V2 = randomBytes(32).toString('hex');

function clearEnv() {
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.SECRETS_MASTER_KEY_V2;
  delete process.env.SECRETS_MASTER_KEY_VERSION;
}

describe('tenant-secrets crypto — round-trip', () => {
  beforeEach(() => {
    clearEnv();
    process.env.SECRETS_MASTER_KEY = KEY_V1;
  });
  afterEach(clearEnv);

  test('encrypt→decrypt devuelve el texto original', () => {
    const secret = 'clave-publica-de-un-mapa-123';
    const payload = encryptSecret(secret);
    assert.equal(decryptSecret(payload), secret);
  });

  test('cada encrypt usa un IV distinto (no determinista)', () => {
    const a = encryptSecret('mismo-texto');
    const b = encryptSecret('mismo-texto');
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  test('sin SECRETS_MASTER_KEY_VERSION → currentKeyVersion() es 1 y se persiste en el payload', () => {
    assert.equal(currentKeyVersion(), 1);
    const payload = encryptSecret('x');
    assert.equal(payload.keyVersion, 1);
  });
});

describe('tenant-secrets crypto — integridad', () => {
  beforeEach(() => {
    clearEnv();
    process.env.SECRETS_MASTER_KEY = KEY_V1;
  });
  afterEach(clearEnv);

  test('authTag manipulado → decrypt lanza', () => {
    const payload = encryptSecret('dato-sensible');
    const tampered = { ...payload, authTag: 'ff'.repeat(16) };
    assert.throws(() => decryptSecret(tampered));
  });

  test('ciphertext manipulado (GCM) → decrypt lanza', () => {
    const payload = encryptSecret('dato-sensible');
    const flippedLastChar = payload.ciphertext.endsWith('0') ? '1' : '0';
    const tampered = { ...payload, ciphertext: payload.ciphertext.slice(0, -1) + flippedLastChar };
    assert.throws(() => decryptSecret(tampered));
  });

  test('sin SECRETS_MASTER_KEY → lanza', () => {
    delete process.env.SECRETS_MASTER_KEY;
    assert.throws(() => encryptSecret('x'), /SECRETS_MASTER_KEY no definida/);
  });

  test('clave con longitud incorrecta → lanza', () => {
    process.env.SECRETS_MASTER_KEY = 'demasiado-corta';
    assert.throws(() => encryptSecret('x'), /debe ser 32 bytes/);
  });
});

describe('tenant-secrets crypto — rotación de clave maestra (cross-version)', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  test('un secreto cifrado con keyVersion=1 sigue descifrando tras publicar la v2', () => {
    process.env.SECRETS_MASTER_KEY = KEY_V1;
    const payload = encryptSecret('secreto-viejo'); // keyVersion=1 (default)
    assert.equal(payload.keyVersion, 1);

    // Se publica la v2 y se sube la versión "actual" — la fila vieja no se re-emite.
    process.env.SECRETS_MASTER_KEY_V2 = KEY_V2;
    process.env.SECRETS_MASTER_KEY_VERSION = '2';
    assert.equal(currentKeyVersion(), 2);
    assert.equal(decryptSecret(payload), 'secreto-viejo');
  });

  test('un cifrado nuevo tras la rotación usa la v2, y no se puede descifrar con la v1', () => {
    process.env.SECRETS_MASTER_KEY = KEY_V1;
    process.env.SECRETS_MASTER_KEY_V2 = KEY_V2;
    process.env.SECRETS_MASTER_KEY_VERSION = '2';

    const payload = encryptSecret('secreto-nuevo');
    assert.equal(payload.keyVersion, 2);
    assert.equal(decryptSecret(payload), 'secreto-nuevo');

    const asV1 = { ...payload, keyVersion: 1 };
    assert.throws(() => decryptSecret(asV1));
  });
});
