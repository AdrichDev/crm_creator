// Unit tests de `testProviderConnection` (crm-onboarding-tenant-keys WU2).
// Runner: node --import tsx --test
//
// `fetchImpl`/`createPool` se inyectan vía el tercer parámetro `deps` (ver nota de
// implementación en provider-test.ts): este repo no corre `node:test` con
// `--experimental-test-module-mocks`, así que mockear el módulo `pg` desde fuera no es
// viable; se inyecta un doble de `OneShotPool` en su lugar (mismo patrón DI del repo).
//
// Aserciones de seguridad transversales: se espía `console.*` en cada caso y se comprueba
// que NUNCA reciben `value`; y que ningún `detail` de retorno contiene el `value` probado
// ni, para `database`, la cadena de conexión completa.

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { testProviderConnection, type ProviderTestDeps, type OneShotPool } from '../provider-test.js';

const SECRET_VALUE = 'sk-super-secret-value-1234';
const DATABASE_URL = 'postgresql://admin:hunter2@db.internal.example:5432/tenant_db';

function fakeFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return impl as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown, ok = status < 400): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

let consoleSpies: Array<ReturnType<typeof mock.method>>;

beforeEach(() => {
  consoleSpies = [
    mock.method(console, 'log', () => undefined),
    mock.method(console, 'warn', () => undefined),
    mock.method(console, 'error', () => undefined),
    mock.method(console, 'info', () => undefined),
    mock.method(console, 'debug', () => undefined),
  ];
});

afterEach(() => {
  for (const spy of consoleSpies) spy.mock.restore();
});

function assertNoValueLeaked(result: { detail?: string }, secret: string) {
  if (result.detail) assert.ok(!result.detail.includes(secret), `detail no debe contener el value: ${result.detail}`);
  for (const spy of consoleSpies) {
    for (const call of spy.mock.calls) {
      const serialized = JSON.stringify(call.arguments);
      assert.ok(!serialized.includes(secret), `console.* no debe recibir el value: ${serialized}`);
    }
  }
}

const unusedPool: ProviderTestDeps['createPool'] = () => {
  throw new Error('createPool no debería llamarse para providers no-database');
};

describe('testProviderConnection — openai/gemini/anthropic (fetch)', () => {
  for (const provider of ['openai', 'gemini', 'anthropic'] as const) {
    test(`${provider}: respuesta ok → { ok: true }`, async () => {
      const deps: ProviderTestDeps = {
        fetchImpl: fakeFetch(async () => jsonResponse(200, {})),
        createPool: unusedPool,
      };
      const result = await testProviderConnection(provider, SECRET_VALUE, deps);
      assert.deepEqual(result, { ok: true });
      assertNoValueLeaked(result, SECRET_VALUE);
    });

    test(`${provider}: rechazo del proveedor (401) → { ok: false, detail }`, async () => {
      const deps: ProviderTestDeps = {
        fetchImpl: fakeFetch(async () => jsonResponse(401, {}, false)),
        createPool: unusedPool,
      };
      const result = await testProviderConnection(provider, SECRET_VALUE, deps);
      assert.equal(result.ok, false);
      assert.ok(result.detail);
      assertNoValueLeaked(result, SECRET_VALUE);
    });

    test(`${provider}: timeout (fetch nunca resuelve, AbortController) → { ok: false, detail genérico }`, async () => {
      const deps: ProviderTestDeps = {
        fetchImpl: fakeFetch((_url, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
        })),
        createPool: unusedPool,
      };
      const result = await testProviderConnection(provider, SECRET_VALUE, deps);
      assert.deepEqual(result, { ok: false, detail: 'timeout o error de conexión al contactar al recurso' });
      assertNoValueLeaked(result, SECRET_VALUE);
    });
  }

  test('gemini/maps: el value viaja en la URL del fetch pero nunca en el resultado ni en logs', async () => {
    let capturedUrl = '';
    const deps: ProviderTestDeps = {
      fetchImpl: fakeFetch(async (url) => { capturedUrl = url; return jsonResponse(200, {}); }),
      createPool: unusedPool,
    };
    const result = await testProviderConnection('gemini', SECRET_VALUE, deps);
    assert.ok(capturedUrl.includes(encodeURIComponent(SECRET_VALUE)), 'fetch sí recibe el value (necesario para llamar al proveedor)');
    assertNoValueLeaked(result, SECRET_VALUE);
  });
});

describe('testProviderConnection — maps (fetch + status body de Google)', () => {
  test('status ok (ni REQUEST_DENIED ni INVALID_REQUEST) → { ok: true }', async () => {
    const deps: ProviderTestDeps = {
      fetchImpl: fakeFetch(async () => jsonResponse(200, { status: 'ZERO_RESULTS' })),
      createPool: unusedPool,
    };
    const result = await testProviderConnection('maps', SECRET_VALUE, deps);
    assert.deepEqual(result, { ok: true });
  });

  test('status REQUEST_DENIED (key inválida) → { ok: false, detail }', async () => {
    const deps: ProviderTestDeps = {
      fetchImpl: fakeFetch(async () => jsonResponse(200, { status: 'REQUEST_DENIED' })),
      createPool: unusedPool,
    };
    const result = await testProviderConnection('maps', SECRET_VALUE, deps);
    assert.equal(result.ok, false);
    assertNoValueLeaked(result, SECRET_VALUE);
  });
});

describe('testProviderConnection — database (pg, doble de OneShotPool)', () => {
  function fakePool(impl: { query?: () => Promise<unknown>; end?: () => Promise<void> }): ProviderTestDeps['createPool'] {
    return () => ({
      query: impl.query ?? (async () => undefined),
      end: impl.end ?? (async () => undefined),
    } satisfies OneShotPool);
  }

  test('SELECT 1 exitoso → { ok: true }, y el pool se cierra', async () => {
    let ended = false;
    const deps: ProviderTestDeps = {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse para database'); }),
      createPool: fakePool({ query: async () => undefined, end: async () => { ended = true; } }),
    };
    const result = await testProviderConnection('database', DATABASE_URL, deps);
    assert.deepEqual(result, { ok: true });
    assert.ok(ended, 'el pool debe cerrarse en finally');
    assertNoValueLeaked(result, DATABASE_URL);
  });

  test('conexión rechazada → { ok: false, detail genérico sin host/user/pass }, pool cerrado igualmente', async () => {
    let ended = false;
    const deps: ProviderTestDeps = {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse'); }),
      createPool: fakePool({
        query: async () => { throw new Error(`connection refused to ${DATABASE_URL}`); },
        end: async () => { ended = true; },
      }),
    };
    const result = await testProviderConnection('database', DATABASE_URL, deps);
    assert.deepEqual(result, { ok: false, detail: 'no se pudo conectar la base de datos' });
    assert.ok(ended, 'el pool debe cerrarse en finally aunque query falle');
    assertNoValueLeaked(result, DATABASE_URL);
    assert.ok(!result.detail?.includes('admin'), 'detail no debe llevar el usuario de la cadena');
    assert.ok(!result.detail?.includes('hunter2'), 'detail no debe llevar la contraseña de la cadena');
    assert.ok(!result.detail?.includes('db.internal.example'), 'detail no debe llevar el host de la cadena');
  });

  test('pool.end() que también falla no rompe el resultado (best-effort)', async () => {
    const deps: ProviderTestDeps = {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse'); }),
      createPool: fakePool({
        query: async () => undefined,
        end: async () => { throw new Error('end failure'); },
      }),
    };
    const result = await testProviderConnection('database', DATABASE_URL, deps);
    assert.deepEqual(result, { ok: true });
  });
});
