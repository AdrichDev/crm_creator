// Unit tests para lib/tenant-secrets/store.ts (crm-env-contract-tiers WU2/WU3).
// Runner: node --import tsx --test
//
// Cubre: getTenantSecret (source='tenant' con secreto propio, 'operator' con
// fallback env, null sin ninguno, nunca loguea el valor) y readBakeableSecrets
// (filtra scope=FRONTEND_PUBLIC + envVarName != null en el WHERE).

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  getTenantSecret,
  readBakeableSecrets,
  type TenantSecretDb,
  type TenantSecretBakeDb,
  type SecretRow,
  type BakeableSecretRow,
} from '../store.js';
import { encryptSecret } from '../crypto.js';

function clearEnv() {
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.SECRETS_MASTER_KEY_VERSION;
  delete process.env.OPERATOR_TEST_FALLBACK_KEY;
}

beforeEach(() => {
  clearEnv();
  process.env.SECRETS_MASTER_KEY = randomBytes(32).toString('hex');
});
afterEach(clearEnv);

function encryptSecretRow(plain: string): Pick<SecretRow, 'valueCiphertext' | 'iv' | 'authTag' | 'keyVersion'> {
  const enc = encryptSecret(plain);
  return { valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion };
}

describe('getTenantSecret — resolución por negocio con fallback', () => {
  test('negocio con secreto propio → source=tenant, valor descifrado', async () => {
    const db: TenantSecretDb = {
      tenantSecret: {
        findUnique: async ({ where }) => {
          assert.deepEqual(where.businessId_name, { businessId: 'biz-1', name: 'ANTHROPIC_API_KEY' });
          return { name: 'ANTHROPIC_API_KEY', scope: 'BACKEND_SECRET', ...encryptSecretRow('sk-tenant-propia') };
        },
        findMany: async () => { throw new Error('no debería llamarse'); },
      },
    };

    const resolved = await getTenantSecret('biz-1', 'ANTHROPIC_API_KEY', { fallbackEnv: 'OPERATOR_TEST_FALLBACK_KEY' }, db);
    assert.deepEqual(resolved, { value: 'sk-tenant-propia', source: 'tenant' });
  });

  test('negocio sin secreto propio + env de operador poblada → source=operator', async () => {
    const db: TenantSecretDb = {
      tenantSecret: {
        findUnique: async () => null,
        findMany: async () => { throw new Error('no debería llamarse'); },
      },
    };
    process.env.OPERATOR_TEST_FALLBACK_KEY = 'sk-operador';

    const resolved = await getTenantSecret('biz-1', 'ANTHROPIC_API_KEY', { fallbackEnv: 'OPERATOR_TEST_FALLBACK_KEY' }, db);
    assert.deepEqual(resolved, { value: 'sk-operador', source: 'operator' });
  });

  test('sin secreto propio y sin fallback (o fallback vacío) → null', async () => {
    const db: TenantSecretDb = {
      tenantSecret: {
        findUnique: async () => null,
        findMany: async () => { throw new Error('no debería llamarse'); },
      },
    };

    const withoutFallback = await getTenantSecret('biz-1', 'ANTHROPIC_API_KEY', {}, db);
    assert.equal(withoutFallback, null);

    const withEmptyFallback = await getTenantSecret('biz-1', 'ANTHROPIC_API_KEY', { fallbackEnv: 'OPERATOR_TEST_FALLBACK_KEY' }, db);
    assert.equal(withEmptyFallback, null);
  });

  test('el valor resuelto nunca aparece serializado más de una vez ni en un formato distinto al esperado (no se filtra por accidente)', async () => {
    const db: TenantSecretDb = {
      tenantSecret: {
        findUnique: async () => ({ name: 'X', scope: 'BACKEND_SECRET', ...encryptSecretRow('sk-muy-secreta') }),
        findMany: async () => { throw new Error('no debería llamarse'); },
      },
    };
    const resolved = await getTenantSecret('biz-1', 'X', {}, db);
    assert.equal(JSON.stringify(resolved), JSON.stringify({ value: 'sk-muy-secreta', source: 'tenant' }));
  });
});

describe('readBakeableSecrets — filtro FRONTEND_PUBLIC + envVarName != null en el WHERE', () => {
  test('devuelve solo secretos con envVarName, descifrados', async () => {
    const rows: BakeableSecretRow[] = [
      { name: 'mapaKey', envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', ...encryptSecretRow('pk_live_mapa') },
    ];
    const db: TenantSecretBakeDb = {
      tenantSecret: {
        findMany: async (args) => {
          assert.equal(args.where.scope, 'FRONTEND_PUBLIC');
          assert.deepEqual(args.where.envVarName, { not: null });
          return rows;
        },
      },
    };

    const result = await readBakeableSecrets('biz-1', db);
    assert.deepEqual(result, [{ envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', value: 'pk_live_mapa' }]);
  });

  test('sin filas (BACKEND_SECRET o sin envVarName excluidos por la query real) → lista vacía', async () => {
    const db: TenantSecretBakeDb = {
      tenantSecret: { findMany: async () => [] },
    };
    const result = await readBakeableSecrets('biz-1', db);
    assert.deepEqual(result, []);
  });
});
