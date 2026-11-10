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
import {
  testProviderConnection,
  postgresConnectConfig,
  type ProviderTestDeps,
  type OneShotPool,
  type SecretProvider,
} from '../provider-test.js';
import type { LookupFn } from '../../ssrf.js';

const SECRET_VALUE = 'sk-super-secret-value-1234';
const DATABASE_URL = 'postgresql://admin:hunter2@db.internal.example:5432/tenant_db';

// F-04/S2: la resolución DNS del guard SSRF se INYECTA (`ProviderTestDeps.lookupHost`)
// — ningún test de este repo toca la red real (el runner no soporta mock.module).
const PUBLIC_IP = '93.184.216.34';

/** Lookup que resuelve los hosts de los fixtures a una IP pública fija. */
const PUBLIC_LOOKUP: LookupFn = async (hostname) => {
  const known = ['x.supabase.co', 'db.internal.example', 'imap.b.com', 'smtp.b.com', 'public.example.com'];
  if (!known.includes(hostname)) {
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
  }
  return [{ address: PUBLIC_IP, family: 4 }];
};

/** Lookup con un mapa host → IPs: lo que no esté en el mapa no resuelve (NXDOMAIN). */
function lookupTo(map: Record<string, string[]>): LookupFn {
  return async (hostname) => {
    const ips = map[hostname];
    if (!ips) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    return ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
}

/** Mensaje exacto de rechazo del guard SSRF: claro y sin datos sensibles. */
const BLOCKED_DETAIL = 'Destino no permitido';
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

// model-catalog S4: DeepSeek NO es proveedor directo ("deepseek entra porque va de la mano
// de nanBuilders"), así que `testProviderConnection` ya no lo conoce: su prueba de clave falla
// cerrada y NO abre ninguna conexión (nada de api.deepseek.com).
describe('testProviderConnection — proveedor fuera del catálogo (deepseek)', () => {
  test('no llama a fetch y falla cerrado, sin filtrar el value', async () => {
    let fetchCalls = 0;
    const deps: ProviderTestDeps = {
      fetchImpl: fakeFetch(async () => {
        fetchCalls += 1;
        return jsonResponse(200, { data: [] });
      }),
      createPool: unusedPool,
    };

    // El nombre sigue llegando desde fuera (p. ej. una fila vieja del panel): se fuerza el tipo
    // para comprobar el comportamiento en tiempo de ejecución.
    const stale = 'deepseek' as unknown as SecretProvider;
    const result = await testProviderConnection(stale, SECRET_VALUE, deps);

    assert.equal(fetchCalls, 0, 'un proveedor no soportado no debe abrir ninguna conexión');
    assert.deepEqual(result, { ok: false, detail: 'proveedor no soportado' });
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

describe('testProviderConnection — supabase_url (fetch real a /auth/v1/health)', () => {
  test('URL https válida + fetch 200 → { ok: true }', async () => {
    const result = await testProviderConnection('supabase_url', 'https://x.supabase.co', {
      fetchImpl: fakeFetch(async () => jsonResponse(200, {})),
      createPool: unusedPool,
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.deepEqual(result, { ok: true });
  });

  test('URL inválida (new URL lanza) → { ok: false, detail sin value, sin llamar fetch }', async () => {
    const value = 'esto-no-es-una-url';
    const result = await testProviderConnection('supabase_url', value, {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse con URL inválida'); }),
      createPool: unusedPool,
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.equal(result.ok, false);
    assertNoValueLeaked(result, value);
  });

  test('URL http (no https) → { ok: false, detail sin value, sin llamar fetch }', async () => {
    const value = 'http://x.supabase.co';
    const result = await testProviderConnection('supabase_url', value, {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse con protocolo no-https'); }),
      createPool: unusedPool,
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.equal(result.ok, false);
    assertNoValueLeaked(result, value);
  });

  test('fetch responde 401 (gateway sin apikey) → { ok: true }: el host respondió = URL alcanzable', async () => {
    const value = 'https://x.supabase.co';
    const result = await testProviderConnection('supabase_url', value, {
      fetchImpl: fakeFetch(async () => jsonResponse(401, {}, false)),
      createPool: unusedPool,
      lookupHost: PUBLIC_LOOKUP,
    });
    // El gateway Kong de Supabase responde 401 a /auth/v1/health sin `apikey`; ese 401
    // ya confirma que la URL apunta a un Supabase real y alcanzable → no debe fallar.
    assert.equal(result.ok, true);
  });

  test('fallo de red (fetch rechaza) → { ok: false, detail genérico sin value }', async () => {
    const value = 'https://x.supabase.co';
    const result = await testProviderConnection('supabase_url', value, {
      fetchImpl: fakeFetch(async () => { throw new Error('network error'); }),
      createPool: unusedPool,
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.equal(result.ok, false);
    assertNoValueLeaked(result, value);
  });
});

describe('testProviderConnection — supabase_anon (validación de formato local, sin red)', () => {
  test('anon key con forma JWT-ish → { ok: true }', async () => {
    const value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzb21lIjoicGF5bG9hZCJ9.signature';
    const result = await testProviderConnection('supabase_anon', value, {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse para supabase_anon'); }),
      createPool: unusedPool,
    });
    assert.deepEqual(result, { ok: true });
  });

  test('string basura no-JWT → { ok: false, detail sin value, sin llamar fetch }', async () => {
    const value = 'esto-no-es-una-key-valida';
    const result = await testProviderConnection('supabase_anon', value, {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse para supabase_anon'); }),
      createPool: unusedPool,
    });
    assert.equal(result.ok, false);
    assertNoValueLeaked(result, value);
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
      lookupHost: PUBLIC_LOOKUP,
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
      lookupHost: PUBLIC_LOOKUP,
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
      lookupHost: PUBLIC_LOOKUP,
    };
    const result = await testProviderConnection('database', DATABASE_URL, deps);
    assert.deepEqual(result, { ok: true });
  });
});

// ---------------------------------------------------------------------------
// F-04 / S2 — guard SSRF en las TRES ramas que abren una conexión de red
// (supabase_url, database, mail). Cada regla se prueba al menos una vez, y en
// toda rama se comprueba que el conector correspondiente NO se invoca cuando el
// destino se rechaza (nada de abrir sockets hacia la red interna).
// ---------------------------------------------------------------------------

describe('F-04/S2 — guard SSRF: database (cadena de conexión Postgres)', () => {
  const rejectingPool: ProviderTestDeps['createPool'] = () => {
    throw new Error('createPool NO debe llamarse para un destino bloqueado');
  };
  const deps = (): ProviderTestDeps => ({
    fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse para database'); }),
    createPool: rejectingPool,
    lookupHost: PUBLIC_LOOKUP,
  });

  const blocked = [
    ['loopback', '127.0.0.1', 'postgresql://u:p@127.0.0.1:5432/db'],
    ['loopback (127.0.0.5)', '127.0.0.5', 'postgresql://u:p@127.0.0.5:5432/db'],
    ['privada 10.x', '10.1.2.3', 'postgresql://u:p@10.1.2.3:5432/db'],
    ['privada 172.16.x', '172.16.4.5', 'postgresql://u:p@172.16.4.5:5432/db'],
    ['privada 192.168.x', '192.168.1.50', 'postgresql://u:p@192.168.1.50:5432/db'],
    ['link-local/metadata', '169.254.169.254', 'postgresql://u:p@169.254.169.254:5432/db'],
    ['CGNAT 100.64.x', '100.64.0.1', 'postgresql://u:p@100.64.0.1:5432/db'],
    ['IPv6 ::1', '::1', 'postgresql://u:p@[::1]:5432/db'],
    ['IPv6 fc00::', 'fc00::1', 'postgresql://u:p@[fc00::1]:5432/db'],
  ] as const;

  for (const [label, , connectionString] of blocked) {
    test(`rechaza destino ${label} sin abrir el pool`, async () => {
      const result = await testProviderConnection('database', connectionString, deps());
      assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
      assertNoValueLeaked(result, connectionString);
    });
  }

  test('rechaza un hostname que resuelve a una IP privada, sin abrir el pool', async () => {
    const connectionString = 'postgresql://admin:hunter2@db.corp.local:5432/tenant_db';
    const d: ProviderTestDeps = {
      ...deps(),
      lookupHost: lookupTo({ 'db.corp.local': ['192.168.1.50'] }),
    };
    const result = await testProviderConnection('database', connectionString, d);
    assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
    assertNoValueLeaked(result, connectionString);
    assert.ok(!result.detail?.includes('db.corp.local'), 'detail no debe llevar el host de la cadena');
  });

  test('rechaza (fail-closed) un host de la cadena que no resuelve', async () => {
    const connectionString = 'postgresql://u:p@nowhere.example:5432/db';
    const result = await testProviderConnection('database', connectionString, {
      ...deps(),
      lookupHost: lookupTo({}),
    });
    assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
  });

  test('host público: el pool SÍ se abre y la prueba sigue funcionando', async () => {
    let opened = 0;
    const result = await testProviderConnection('database', DATABASE_URL, {
      fetchImpl: fakeFetch(async () => { throw new Error('fetch no debería llamarse'); }),
      createPool: () => {
        opened += 1;
        return { query: async () => undefined, end: async () => undefined } satisfies OneShotPool;
      },
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(opened, 1, 'un destino público no debe bloquearse');
  });
});

describe('F-04/S2 — guard SSRF: supabase_url', () => {
  const unusedPoolForUrl: ProviderTestDeps['createPool'] = () => {
    throw new Error('createPool no debería llamarse para supabase_url');
  };
  const noFetch = fakeFetch(async () => {
    throw new Error('fetch NO debe llamarse para un destino bloqueado');
  });

  const blocked = [
    ['loopback', 'https://127.0.0.1'],
    ['privada 10.x', 'https://10.1.2.3'],
    ['privada 172.16.x', 'https://172.16.4.5'],
    ['privada 192.168.x', 'https://192.168.1.50'],
    ['link-local/metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['CGNAT 100.64.x', 'https://100.64.0.1'],
    ['IPv6 ::1', 'https://[::1]'],
    ['IPv6 fc00::', 'https://[fc00::1]'],
  ] as const;

  for (const [label, value] of blocked) {
    test(`rechaza destino ${label} sin llamar a fetch`, async () => {
      const result = await testProviderConnection('supabase_url', value, {
        fetchImpl: noFetch,
        createPool: unusedPoolForUrl,
        lookupHost: PUBLIC_LOOKUP,
      });
      assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
      assertNoValueLeaked(result, value);
    });
  }

  test('rechaza un hostname que resuelve a una IP privada, sin llamar a fetch', async () => {
    const value = 'https://internal.corp.local';
    const result = await testProviderConnection('supabase_url', value, {
      fetchImpl: noFetch,
      createPool: unusedPoolForUrl,
      lookupHost: lookupTo({ 'internal.corp.local': ['10.1.2.3'] }),
    });
    assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
    assertNoValueLeaked(result, value);
  });

  test('rechaza un hostname con varias A si UNA es privada (rebinding)', async () => {
    const value = 'https://rebind.example.com';
    const result = await testProviderConnection('supabase_url', value, {
      fetchImpl: noFetch,
      createPool: unusedPoolForUrl,
      lookupHost: lookupTo({ 'rebind.example.com': [PUBLIC_IP, '127.0.0.1'] }),
    });
    assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
  });

  test('URL http (no https) se sigue rechazando por formato, antes de resolver DNS', async () => {
    const value = 'http://x.supabase.co';
    let lookups = 0;
    const result = await testProviderConnection('supabase_url', value, {
      fetchImpl: noFetch,
      createPool: unusedPoolForUrl,
      lookupHost: async () => { lookups += 1; return [{ address: PUBLIC_IP, family: 4 }]; },
    });
    assert.equal(result.ok, false);
    assert.equal(lookups, 0, 'un esquema no-https no debe llegar a resolver DNS');
  });

  test('host público: fetch SÍ se llama y la prueba sigue funcionando', async () => {
    const called: string[] = [];
    const result = await testProviderConnection('supabase_url', 'https://x.supabase.co', {
      fetchImpl: fakeFetch(async (url) => { called.push(url); return jsonResponse(200, {}); }),
      createPool: unusedPoolForUrl,
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(called.length, 1, 'un destino público no debe bloquearse');
  });
});

describe('F-04/S2 — guard SSRF: mail (IMAP/SMTP)', () => {
  const unusedPoolForMail: ProviderTestDeps['createPool'] = () => {
    throw new Error('createPool no debería llamarse para mail');
  };
  const noFetch = fakeFetch(async () => {
    throw new Error('fetch no debería llamarse para mail');
  });
  const baseCfg = { address: 'a@b.com', appPassword: 'app-pass-secreta', imapPort: 993, smtpPort: 465 };
  /** Doble de IMAP+SMTP que falla el test si se le invoca: prueba que no hubo conexión. */
  const forbiddenMail: ProviderTestDeps['testMail'] = async () => {
    throw new Error('testMail NO debe llamarse para un destino bloqueado');
  };

  function cfgValue(hosts: { imapHost?: string; smtpHost?: string }): string {
    return JSON.stringify({ ...baseCfg, ...hosts });
  }

  test('rechaza IMAP loopback sin invocar al conector', async () => {
    const value = cfgValue({ imapHost: '127.0.0.1', smtpHost: 'smtp.b.com' });
    const result = await testProviderConnection('mail', value, {
      fetchImpl: noFetch,
      createPool: unusedPoolForMail,
      testMail: forbiddenMail,
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
    assert.ok(!result.detail?.includes(baseCfg.appPassword), 'detail no debe filtrar la contraseña');
  });

  test('rechaza SMTP en 10.x aunque el IMAP sea público, sin invocar al conector', async () => {
    const value = cfgValue({ imapHost: 'imap.b.com', smtpHost: '10.1.2.3' });
    const result = await testProviderConnection('mail', value, {
      fetchImpl: noFetch,
      createPool: unusedPoolForMail,
      testMail: forbiddenMail,
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
  });

  const blocked = [
    ['192.168.x', '192.168.1.50'],
    ['link-local/metadata', '169.254.169.254'],
    ['CGNAT 100.64.x', '100.64.0.1'],
    ['IPv6 ::1', '::1'],
    ['IPv6 fc00::', 'fc00::1'],
  ] as const;

  for (const [label, host] of blocked) {
    test(`rechaza un host ${label} en SMTP sin invocar al conector`, async () => {
      const value = cfgValue({ imapHost: 'imap.b.com', smtpHost: host });
      const result = await testProviderConnection('mail', value, {
        fetchImpl: noFetch,
        createPool: unusedPoolForMail,
        testMail: forbiddenMail,
        lookupHost: PUBLIC_LOOKUP,
      });
      assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
    });
  }

  test('rechaza un host de correo que resuelve a una IP privada, sin invocar al conector', async () => {
    const value = cfgValue({ imapHost: 'imap.corp.local', smtpHost: 'smtp.b.com' });
    const result = await testProviderConnection('mail', value, {
      fetchImpl: noFetch,
      createPool: unusedPoolForMail,
      testMail: forbiddenMail,
      lookupHost: lookupTo({ 'imap.corp.local': ['192.168.1.50'], 'smtp.b.com': [PUBLIC_IP] }),
    });
    assert.deepEqual(result, { ok: false, detail: BLOCKED_DETAIL });
  });

  test('hosts públicos: el conector SÍ se invoca y el resultado se propaga', async () => {
    let mailCalls = 0;
    const value = cfgValue({ imapHost: 'imap.b.com', smtpHost: 'smtp.b.com' });
    const result = await testProviderConnection('mail', value, {
      fetchImpl: noFetch,
      createPool: unusedPoolForMail,
      testMail: async () => { mailCalls += 1; return { imap: true, smtp: true }; },
      lookupHost: PUBLIC_LOOKUP,
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(mailCalls, 1, 'un destino público no debe bloquearse');
  });

  test('config sin hosts: no resuelve nada y el comportamiento previo se mantiene', async () => {
    let lookups = 0;
    const result = await testProviderConnection('mail', JSON.stringify(baseCfg), {
      fetchImpl: noFetch,
      createPool: unusedPoolForMail,
      testMail: async () => ({ imap: false, smtp: false, detail: 'IMAP: falta IMAP_HOST | SMTP: falta SMTP_HOST' }),
      lookupHost: async () => { lookups += 1; return [{ address: PUBLIC_IP, family: 4 }]; },
    });
    assert.equal(result.ok, false);
    assert.equal(lookups, 0, 'sin hosts configurados no hay nada que resolver');
  });
});

// ---------------------------------------------------------------------------
// F-04 / S2 — política TLS del pool de prueba Postgres. En producción el
// certificado del servidor SIEMPRE se verifica: se eliminó el
// `ssl: { rejectUnauthorized: false }` incondicional y el único escape
// (`PG_TLS_INSECURE=1`, solo desarrollo) se ignora con NODE_ENV=production.
// ---------------------------------------------------------------------------

describe('F-04/S2 — TLS del pool Postgres (verificación del certificado)', () => {
  const prod = { NODE_ENV: 'production' } as const;
  const dev = { NODE_ENV: 'development' } as const;

  test('producción: SSL activo con el certificado VERIFICADO, cadena intacta', () => {
    const config = postgresConnectConfig(DATABASE_URL, prod);
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    assert.equal(config.connectionString, DATABASE_URL, 'sin nada que sanear, la cadena no se toca');
  });

  test('producción: `sslmode=no-verify` NO puede desactivar la verificación', () => {
    const config = postgresConnectConfig(`${DATABASE_URL}?sslmode=no-verify`, prod);
    assert.ok(!config.connectionString.includes('no-verify'), 'el parámetro que apaga la verificación se elimina');
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  });

  test('producción: `uselibpqcompat=true` tampoco desactiva la verificación', () => {
    const config = postgresConnectConfig(`${DATABASE_URL}?sslmode=require&uselibpqcompat=true`, prod);
    assert.ok(!config.connectionString.includes('uselibpqcompat'), 'el modo compat libpq se elimina');
    assert.equal(config.ssl, undefined, '`sslmode` sigue mandando: pg verifica por defecto con ssl={}');
    assert.ok(config.connectionString.includes('sslmode=require'), 'el sslmode legítimo se respeta');
  });

  test('desarrollo: PG_TLS_INSECURE=1 permite certificado autofirmado', () => {
    const config = postgresConnectConfig(DATABASE_URL, { NODE_ENV: 'development', PG_TLS_INSECURE: '1' });
    assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  });

  test('desarrollo sin el flag: se verifica igual (sin debilitar por defecto)', () => {
    assert.deepEqual(postgresConnectConfig(DATABASE_URL, dev).ssl, { rejectUnauthorized: true });
    assert.deepEqual(
      postgresConnectConfig(DATABASE_URL, { NODE_ENV: 'development', PG_TLS_INSECURE: '0' }).ssl,
      { rejectUnauthorized: true },
    );
  });

  test('el escape de desarrollo se IGNORA en producción', () => {
    const config = postgresConnectConfig(DATABASE_URL, { NODE_ENV: 'production', PG_TLS_INSECURE: '1' });
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  });

  test('un `sslmode` explícito y seguro del tenant se respeta (verify-full)', () => {
    const value = `${DATABASE_URL}?sslmode=verify-full`;
    const config = postgresConnectConfig(value, prod);
    assert.equal(config.connectionString, value);
    assert.equal(config.ssl, undefined, 'la cadena decide: verify-full ya exige verificación');
  });
});
