// Guard anti-SSRF para los destinos que un humano (o el panel del tenant) puede
// escribir: la URL de Supabase, la cadena de conexión Postgres y los hosts IMAP/SMTP.
//
// Nace del hallazgo F-04 de la auditoría integral (spec S2): el "Probar conexión" de
// `tenant-secrets` abría una conexión real contra el destino que pegara un ADMIN/MANAGER
// del tenant, lo que permitía sondear la red interna del servidor (loopback, RFC1918,
// link-local, el endpoint de metadata del cloud…).
//
// Puerto de `agents-agency/back/src/lib/ssrf.ts` (guard ya probado), con dos
// adaptaciones a este repo:
//   1. La resolución DNS es INYECTABLE (`LookupFn`). El runner de tests de este repo
//      (`node --test` sin `--experimental-test-module-mocks`) no permite mockear
//      `node:dns`, así que los tests pasan un stub y NUNCA tocan la red real.
//   2. `assertPublicUrl` solo admite `https:` (el único caso de uso aquí son URLs de
//      Supabase); `http` se rechaza en lugar de permitirse.
//
// Regla de fallo: si no se puede determinar que el destino es público, se RECHAZA
// (fail-closed). Un host que no resuelve, un literal que no parsea y una lista de
// direcciones vacía son todos rechazos, nunca un pase libre.

import dns from 'node:dns';
import net from 'node:net';

/** Una dirección resuelta por DNS (forma de `dns.promises.lookup` con `all: true`). */
export interface LookupAddress {
  address: string;
  family: number;
}

/** Resolución DNS inyectable. Producción usa `defaultLookup` (DNS del sistema). */
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

/** Rechazo del guard. El mensaje NUNCA se devuelve al cliente tal cual: `provider-test`
 * lo traduce a un `detail` genérico ("Destino no permitido"). */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/** DNS real del sistema. `all: true` porque hay que validar TODAS las direcciones. */
export const defaultLookup: LookupFn = async (hostname) =>
  dns.promises.lookup(hostname, { all: true }) as Promise<LookupAddress[]>;

/** Hostnames de metadata de cloud (AWS/GCP/Azure) que se bloquean por nombre. */
const METADATA_HOSTNAMES = new Set(['metadata', 'metadata.google.internal', 'instance-data']);

/** Convierte una IPv4 en su entero de 32 bits. */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number(p));
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inV4Cidr(ip: string, base: string, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** ¿Es una IPv4 privada/loopback/link-local/metadata/no enrutable? */
function isBlockedIPv4(ip: string): boolean {
  return (
    inV4Cidr(ip, '0.0.0.0', 8) || // "este host" / 0.0.0.0
    inV4Cidr(ip, '127.0.0.0', 8) || // loopback
    inV4Cidr(ip, '10.0.0.0', 8) || // privada
    inV4Cidr(ip, '172.16.0.0', 12) || // privada
    inV4Cidr(ip, '192.168.0.0', 16) || // privada
    inV4Cidr(ip, '169.254.0.0', 16) || // link-local (incluye 169.254.169.254, metadata)
    inV4Cidr(ip, '100.64.0.0', 10) || // CGNAT
    inV4Cidr(ip, '192.0.0.0', 24) || // IETF protocol assignments
    inV4Cidr(ip, '192.0.2.0', 24) || // TEST-NET-1
    inV4Cidr(ip, '198.18.0.0', 15) || // benchmarking
    inV4Cidr(ip, '240.0.0.0', 4) // reservado
  );
}

/** Pasa una IPv4 mapeada en IPv6 (`::ffff:7f00:1`) a cuartetos decimales. */
function mappedV4FromHex(hiHex: string, loHex: string): string {
  const hi = parseInt(hiHex, 16);
  const lo = parseInt(loHex, 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** ¿Es una IPv6 bloqueada (loopback, ULA, link-local, mapeada a IPv4 privada)? */
function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  // IPv4 mapeada (::ffff:a.b.c.d) → validar la parte IPv4
  const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isBlockedIPv4(mappedDotted[1]);
  // …y su forma hexadecimal (::ffff:7f00:1)
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) return isBlockedIPv4(mappedV4FromHex(mappedHex[1], mappedHex[2]));
  if (lower.startsWith('fe80')) return true; // link-local fe80::/10
  // unique-local fc00::/7 → primer byte 0xfc o 0xfd
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  return false;
}

/** ¿La IP (v4 o v6) está en un rango bloqueado? Lo no parseable se bloquea. */
export function isBlockedAddress(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIPv4(ip);
  if (type === 6) return isBlockedIPv6(ip);
  return true; // no parseable → bloquear por seguridad
}

/** Normaliza un host de config/URL: sin corchetes IPv6, minúsculas, sin punto final. */
function normalizeHost(host: string): string {
  return host.trim().replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

/**
 * Valida que un HOST (solo el nombre, sin puerto ni ruta) apunte a un destino
 * público. Lanza `SsrfError` si:
 *   - el host está vacío o es un hostname de metadata,
 *   - el host es un literal IP en un rango bloqueado,
 *   - el host resuelve por DNS a CUALQUIER dirección bloqueada (rebinding incluido),
 *   - el host no resuelve o no devuelve direcciones (fail-closed).
 *
 * `lookup` es inyectable: los tests pasan un stub y no tocan la red.
 */
export async function assertPublicHost(host: string, lookup: LookupFn = defaultLookup): Promise<void> {
  const hostname = normalizeHost(host);
  if (!hostname) throw new SsrfError('Host vacío');

  if (METADATA_HOSTNAMES.has(hostname)) throw new SsrfError('Host de metadata bloqueado');

  // Si el host ya es un literal IP, se valida directamente (sin DNS).
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new SsrfError('IP no pública bloqueada');
    return;
  }

  // Resolver DNS: TODAS las direcciones deben ser públicas.
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new SsrfError('No se pudo resolver el host');
  }
  if (!addresses || addresses.length === 0) throw new SsrfError('Host sin direcciones');

  for (const { address } of addresses) {
    if (isBlockedAddress(address)) throw new SsrfError('El host resuelve a una IP no pública');
  }
}

export interface AssertPublicUrlOptions {
  /** Resolución DNS inyectable (tests). Default: DNS del sistema. */
  lookup?: LookupFn;
}

/**
 * Valida que una URL apunte a un destino público. Solo se admite `https:` (el único
 * caso de uso es la URL de Supabase del panel del tenant). Lanza `SsrfError` si el
 * esquema no es https, la URL no parsea o el host no es público.
 * Devuelve el objeto `URL` ya parseado.
 */
export async function assertPublicUrl(
  rawUrl: string,
  options: AssertPublicUrlOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('URL no válida');
  }
  if (url.protocol !== 'https:') throw new SsrfError('Esquema no permitido');
  await assertPublicHost(url.hostname, options.lookup ?? defaultLookup);
  return url;
}
