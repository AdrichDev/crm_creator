// nanBuilders como proveedor INTERNO en creador_CRM: la prueba de la clave va contra SU base
// URL (OpenAI-compatible) y sin base configurada falla cerrado, sin mandar la clave a OpenAI.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { testProviderConnection, type ProviderTestDeps } from '../provider-test.js';

// 203.0.113.0/24 es TEST-NET-3: el guard la bloquea (correcto). Se usa una IP realmente pública.
const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 as const }];

function deps(calls: string[], ok = true): ProviderTestDeps {
  // `createPool` y `testMail` no se usan en la rama de nanBuilders: se declaran para el tipo.
  return {
    lookupHost: PUBLIC_LOOKUP,
    fetchImpl: (async (url: string) => {
      calls.push(String(url));
      return { ok, status: ok ? 200 : 401 } as unknown as Response;
    }) as unknown as ProviderTestDeps['fetchImpl'],
    createPool: (() => {
      throw new Error('no debería crear un pool en la prueba de nanBuilders');
    }) as unknown as ProviderTestDeps['createPool'],
    testMail: (async () => ({ ok: false, detail: 'no aplica' })) as unknown as ProviderTestDeps['testMail'],
  };
}

const savedBase = process.env.NANBUILDERS_BASE_URL;
beforeEach(() => {
  process.env.NANBUILDERS_BASE_URL = 'https://api.nanbuilders.example/v1';
});
process.on('beforeExit', () => {
  if (savedBase === undefined) delete process.env.NANBUILDERS_BASE_URL;
  else process.env.NANBUILDERS_BASE_URL = savedBase;
});

describe('nanBuilders — prueba de clave', () => {
  test('consulta /models en la base URL configurada', async () => {
    const calls: string[] = [];
    const res = await testProviderConnection('nanbuilders', 'clave-de-prueba', deps(calls));
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(calls, ['https://api.nanbuilders.example/v1/models']);
  });

  test('una clave rechazada devuelve el detalle con el código del proveedor', async () => {
    const calls: string[] = [];
    const res = await testProviderConnection('nanbuilders', 'clave-mala', deps(calls, false));
    assert.equal(res.ok, false);
    assert.match(String((res as { detail?: string }).detail), /nanbuilders respondió 401/);
  });

  test('sin NANBUILDERS_BASE_URL falla cerrado y no llama a nadie', async () => {
    delete process.env.NANBUILDERS_BASE_URL;
    const calls: string[] = [];
    const res = await testProviderConnection('nanbuilders', 'clave', deps(calls));
    assert.equal(res.ok, false);
    assert.match(String((res as { detail?: string }).detail), /NANBUILDERS_BASE_URL/);
    assert.deepEqual(calls, []);
  });

  test('un destino no público se rechaza antes de la llamada (guard anti-SSRF)', async () => {
    process.env.NANBUILDERS_BASE_URL = 'https://127.0.0.1/v1';
    const calls: string[] = [];
    const res = await testProviderConnection('nanbuilders', 'clave', deps(calls));
    assert.equal(res.ok, false);
    assert.deepEqual(calls, []);
  });
});
