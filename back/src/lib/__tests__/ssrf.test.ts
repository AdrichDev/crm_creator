// Unit tests del guard SSRF (F-04, S2) — `back/src/lib/ssrf.ts`.
// Runner: node --import tsx --test
//
// Puertos desde `agents-agency/back/src/lib/ssrf.ts` (guard ya probado), adaptados
// al estilo node:test de este repo y a su invariante de DI: ESTE runner no soporta
// `--experimental-test-module-mocks`, así que la resolución DNS se INYECTA
// (`LookupFn`) en lugar de mockear `node:dns`. Ningún test toca la red real.
//
// Cobertura por regla: loopback, privadas 10/172.16/192.168, link-local
// 169.254.169.254 (metadata), CGNAT 100.64, IPv6 ::1 / fc00:: / fe80::,
// hostname que resuelve a una IP privada, varias A con una privada (rebinding),
// host irresoluble (fail-closed) y host público permitido.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SsrfError,
  assertPublicHost,
  assertPublicUrl,
  isBlockedAddress,
  type LookupAddress,
  type LookupFn,
} from '../ssrf.js';

/** Stub de resolución DNS: mapa host → IPs. Host ausente del mapa = NXDOMAIN. */
function stubLookup(map: Record<string, string[]>): LookupFn & { calls: string[] } {
  const calls: string[] = [];
  const lookup: LookupFn = async (hostname: string): Promise<LookupAddress[]> => {
    calls.push(hostname);
    const ips = map[hostname];
    if (!ips) {
      const err = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
      throw err;
    }
    return ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  return Object.assign(lookup, { calls });
}

/** Stub que nunca debe usarse: si se llama, el destino no era un literal IP. */
const forbiddenLookup: LookupFn = async (hostname) => {
  throw new Error(`lookup no debería llamarse para ${hostname}`);
};

async function expectRejected(promise: Promise<unknown>, label: string) {
  await assert.rejects(promise, SsrfError, `${label} debe rechazarse con SsrfError`);
}

describe('ssrf — isBlockedAddress', () => {
  test('bloquea loopback IPv4', () => {
    assert.equal(isBlockedAddress('127.0.0.1'), true);
    assert.equal(isBlockedAddress('127.255.255.254'), true);
  });

  test('bloquea privadas 10.0.0.0/8, 172.16.0.0/12 y 192.168.0.0/16', () => {
    assert.equal(isBlockedAddress('10.1.2.3'), true);
    assert.equal(isBlockedAddress('172.16.5.5'), true);
    assert.equal(isBlockedAddress('172.31.255.255'), true);
    assert.equal(isBlockedAddress('192.168.0.1'), true);
    assert.equal(isBlockedAddress('192.168.255.254'), true);
  });

  test('bloquea link-local 169.254.0.0/16 (incluye metadata 169.254.169.254)', () => {
    assert.equal(isBlockedAddress('169.254.169.254'), true);
    assert.equal(isBlockedAddress('169.254.0.1'), true);
  });

  test('bloquea CGNAT 100.64.0.0/10', () => {
    assert.equal(isBlockedAddress('100.64.0.1'), true);
    assert.equal(isBlockedAddress('100.127.255.255'), true);
  });

  test('bloquea "este host" 0.0.0.0 y rangos reservados', () => {
    assert.equal(isBlockedAddress('0.0.0.0'), true);
    assert.equal(isBlockedAddress('240.0.0.1'), true);
  });

  test('bloquea IPv6 loopback ::1 y unspecified ::', () => {
    assert.equal(isBlockedAddress('::1'), true);
    assert.equal(isBlockedAddress('::'), true);
  });

  test('bloquea IPv6 unique-local fc00::/7 y link-local fe80::/10', () => {
    assert.equal(isBlockedAddress('fc00::1'), true);
    assert.equal(isBlockedAddress('fd12:3456:789a::1'), true);
    assert.equal(isBlockedAddress('fe80::1'), true);
  });

  test('bloquea IPv4 mapeada en IPv6 (::ffff:127.0.0.1)', () => {
    assert.equal(isBlockedAddress('::ffff:127.0.0.1'), true);
    assert.equal(isBlockedAddress('::ffff:10.0.0.1'), true);
    // misma dirección en notación hex (
    assert.equal(isBlockedAddress('::ffff:7f00:1'), true);
  });

  test('bloquea por seguridad cualquier cosa que no sea una IP parseable', () => {
    assert.equal(isBlockedAddress('no-es-una-ip'), true);
    assert.equal(isBlockedAddress(''), true);
  });

  test('permite IPs públicas v4 y v6', () => {
    assert.equal(isBlockedAddress('8.8.8.8'), false);
    assert.equal(isBlockedAddress('1.1.1.1'), false);
    assert.equal(isBlockedAddress('93.184.216.34'), false);
    assert.equal(isBlockedAddress('172.32.0.1'), false); // justo fuera de 172.16/12
    assert.equal(isBlockedAddress('100.128.0.1'), false); // justo fuera de 100.64/10
    assert.equal(isBlockedAddress('2606:4700:4700::1111'), false);
  });
});

describe('ssrf — assertPublicHost', () => {
  test('rechaza un literal IP loopback sin consultar DNS', async () => {
    await expectRejected(assertPublicHost('127.0.0.1', forbiddenLookup), '127.0.0.1');
  });

  test('rechaza literales privados 10.x / 172.16.x / 192.168.x', async () => {
    await expectRejected(assertPublicHost('10.0.0.5', forbiddenLookup), '10.0.0.5');
    await expectRejected(assertPublicHost('172.16.0.9', forbiddenLookup), '172.16.0.9');
    await expectRejected(assertPublicHost('192.168.1.50', forbiddenLookup), '192.168.1.50');
  });

  test('rechaza el literal link-local de metadata 169.254.169.254', async () => {
    await expectRejected(assertPublicHost('169.254.169.254', forbiddenLookup), '169.254.169.254');
  });

  test('rechaza el literal CGNAT 100.64.0.1', async () => {
    await expectRejected(assertPublicHost('100.64.0.1', forbiddenLookup), '100.64.0.1');
  });

  test('rechaza literales IPv6 ::1, fc00:: y fe80::', async () => {
    await expectRejected(assertPublicHost('::1', forbiddenLookup), '::1');
    await expectRejected(assertPublicHost('fc00::1', forbiddenLookup), 'fc00::1');
    await expectRejected(assertPublicHost('fe80::1', forbiddenLookup), 'fe80::1');
  });

  test('rechaza el literal IPv6 entre corchetes [::1] (forma de una URL)', async () => {
    await expectRejected(assertPublicHost('[::1]', forbiddenLookup), '[::1]');
  });

  test('rechaza "localhost" (resuelve a loopback)', async () => {
    const lookup = stubLookup({ localhost: ['127.0.0.1', '::1'] });
    await expectRejected(assertPublicHost('localhost', lookup), 'localhost');
    assert.deepEqual(lookup.calls, ['localhost'], 'localhost no es un literal IP: debe resolverse y rechazarse');
  });

  test('rechaza el host de metadata metadata.google.internal', async () => {
    await expectRejected(assertPublicHost('metadata.google.internal', forbiddenLookup), 'metadata.google.internal');
  });

  test('rechaza un hostname que resuelve a una IP privada', async () => {
    const lookup = stubLookup({ 'db.corp.local': ['192.168.1.50'] });
    await expectRejected(assertPublicHost('db.corp.local', lookup), 'db.corp.local');
  });

  test('rechaza si CUALQUIER dirección resuelta es no pública (rebinding)', async () => {
    const lookup = stubLookup({ 'mixed.example.com': ['93.184.216.34', '127.0.0.1'] });
    await expectRejected(assertPublicHost('mixed.example.com', lookup), 'mixed.example.com');
  });

  test('rechaza (fail-closed) un host que no resuelve', async () => {
    const lookup = stubLookup({});
    await expectRejected(assertPublicHost('no-existe.example.com', lookup), 'host NXDOMAIN');
  });

  test('rechaza un host vacío', async () => {
    await expectRejected(assertPublicHost('', forbiddenLookup), 'host vacío');
  });

  test('permite un literal IP público sin consultar DNS', async () => {
    await assertPublicHost('93.184.216.34', forbiddenLookup);
  });

  test('permite un hostname que resuelve solo a IPs públicas', async () => {
    const lookup = stubLookup({ 'smtp.midominio.com': ['93.184.216.34', '2606:4700:4700::1111'] });
    await assertPublicHost('smtp.midominio.com', lookup);
  });
});

describe('ssrf — assertPublicUrl', () => {
  test('rechaza esquemas no https (http, ftp, file)', async () => {
    await expectRejected(assertPublicUrl('http://example.com/', { lookup: forbiddenLookup }), 'http://');
    await expectRejected(assertPublicUrl('ftp://example.com/', { lookup: forbiddenLookup }), 'ftp://');
    await expectRejected(assertPublicUrl('file:///etc/passwd', { lookup: forbiddenLookup }), 'file://');
  });

  test('rechaza una URL que no parsea', async () => {
    await expectRejected(assertPublicUrl('esto-no-es-una-url', { lookup: forbiddenLookup }), 'URL inválida');
  });

  test('rechaza https con literal loopback / privado / metadata sin consultar DNS', async () => {
    await expectRejected(assertPublicUrl('https://127.0.0.1/', { lookup: forbiddenLookup }), 'https loopback');
    await expectRejected(assertPublicUrl('https://10.0.0.5/', { lookup: forbiddenLookup }), 'https 10.x');
    await expectRejected(
      assertPublicUrl('https://169.254.169.254/latest/meta-data/', { lookup: forbiddenLookup }),
      'https metadata',
    );
  });

  test('rechaza https cuyo hostname resuelve a una IP privada', async () => {
    const lookup = stubLookup({ 'internal.corp.local': ['10.1.2.3'] });
    await expectRejected(assertPublicUrl('https://internal.corp.local/auth/v1/health', { lookup }), 'https privado');
  });

  test('permite https público y devuelve la URL parseada', async () => {
    const lookup = stubLookup({ 'x.supabase.co': ['93.184.216.34'] });
    const url = await assertPublicUrl('https://x.supabase.co/auth/v1/health', { lookup });
    assert.ok(url instanceof URL);
    assert.equal(url.hostname, 'x.supabase.co');
    assert.equal(url.protocol, 'https:');
  });
});
