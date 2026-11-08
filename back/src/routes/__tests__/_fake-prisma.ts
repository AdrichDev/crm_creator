// In-memory Prisma stand-in for route tests that need no database.
// Install it with `installFakePrisma()` BEFORE dynamically importing any module
// that imports `../prisma.js`: the lazy singleton picks up `globalThis.prisma`.
import express, { type Router } from 'express';
import type { AddressInfo } from 'node:net';
import { guardDelegateCall } from '../../lib/tenant-scope.js';

type Row = Record<string, unknown>;
export type Seed = Record<string, Row[]>;
/** `client` dice qué cliente hizo la escritura: el root o el cliente de la transacción.
 *  Permite probar que un handler escribe DENTRO de `$transaction` (ver bookings-atomic). */
export type ClientTag = 'root' | 'tx';
export interface Write { model: string; op: string; args: unknown; client: ClientTag }

// Compara valores DateTime/numéricos de un filtro de rango. Devuelve null cuando el par no
// es comparable (p. ej. fechas como string, o columnas que la fila de prueba no tiene).
function compare(actual: unknown, expected: unknown): number | null {
  const a = actual instanceof Date ? actual.getTime() : typeof actual === 'number' ? actual : null;
  const b = expected instanceof Date ? expected.getTime() : typeof expected === 'number' ? expected : null;
  if (a === null || b === null) return null;
  return a - b;
}

function matchValue(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true; // Prisma ignores undefined filters
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
  if (typeof expected === 'object') {
    const ops = expected as Record<string, unknown>;
    if (Array.isArray(ops.in)) return ops.in.includes(actual);
    // Rangos (lt/lte/gt/gte) sobre DateTime/número: se modelan para poder probar el solape
    // de reservas real. Lo no comparable (o ausente en la fila) no filtra, como antes.
    const lt = compare(actual, ops.lt);
    if (lt !== null && !(lt < 0)) return false;
    const lte = compare(actual, ops.lte);
    if (lte !== null && !(lte <= 0)) return false;
    const gt = compare(actual, ops.gt);
    if (gt !== null && !(gt > 0)) return false;
    const gte = compare(actual, ops.gte);
    if (gte !== null && !(gte >= 0)) return false;
    // Resto de operadores sobre una columna escalar (`not`, `contains`, `notIn`…): el doble
    // no los modela. Las relaciones to-one ya no llegan aquí: las resuelve `matchEntry`.
    return true;
  }
  return actual === expected;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Filtro sobre una relación to-one (`{ padre: { … } }` / `{ padre: { is: { … } } }`).
 * Prisma solo devuelve la fila si la fila PADRE cumple el filtro; un FK colgante (padre
 * inexistente) no coincide con nada.
 */
function matchRelation(parent: Row, filter: unknown, store: Seed): boolean {
  if (!isPlainObject(filter)) return true;
  if ('is' in filter || 'isNot' in filter) {
    const is = filter.is === undefined ? true : filter.is === null ? false : matches(parent, filter.is, store);
    const isNot = filter.isNot === undefined ? true : filter.isNot === null ? true : !matches(parent, filter.isNot, store);
    return is && isNot;
  }
  return matches(parent, filter, store);
}

/**
 * ¿Coincide la fila con una entrada del `where`? Una clave que no es columna de la fila pero
 * que tiene FK `<clave>Id` se interpreta como RELACIÓN to-one y se evalúa contra la fila
 * padre del store (`location` → `locationId`, `sale` → `saleId`, `user` → `userId`…).
 *
 * Sin esto un filtro relacional contaba como "coincide" SIEMPRE y una tabla hija (que se
 * acota por su padre porque no tiene `businessId`) devolvía filas de cualquier negocio: los
 * tests de fuga de las hijas pasaban en vacío. Las relaciones to-many (`some`/`none`/`every`)
 * y las claves compuestas (`campo1_campo2`) siguen sin evaluarse (coinciden), que es el
 * comportamiento que ya tenían.
 */
function matchEntry(row: Row, key: string, expected: unknown, store: Seed): boolean {
  if (row[key] === undefined && isPlainObject(expected)) {
    const fk = row[`${key}Id`];
    if (typeof fk === 'string') {
      const parent = (store[key] ?? []).find((p) => p.id === fk);
      if (!parent) return false;
      return matchRelation(parent, expected, store);
    }
  }
  return matchValue(row[key], expected);
}

function matches(row: Row, where: unknown, store: Seed): boolean {
  if (!where || typeof where !== 'object') return true;
  return Object.entries(where as Row).every(([k, v]) => matchEntry(row, k, v, store));
}

export function installFakePrisma() {
  let store: Seed = {};
  const writes: Write[] = [];
  let seq = 0;

  // Guarda de tenancy (S2/S3): TODA llamada de delegado —también la del cliente de
  // transacción (`tx`)— pasa por `guardDelegateCall`, igual que la extensión del cliente
  // real. Así la suite de rutas corre con la guarda activa y una consulta sin negocio
  // (fuera de `runUnscoped`) rompe el test con `TenantScopeError` en vez de pasar.
  const guarded = <A, R>(model: string, op: string, fn: (a: A) => R) => (a?: A): R => {
    guardDelegateCall(model, op, a);
    return fn(a as A);
  };

  const delegate = (model: string, tag: ClientTag) => {
    const rows = () => (store[model] ??= []);
    const log = (op: string, args: unknown) => writes.push({ model, op, args, client: tag });
    return {
      findFirst: guarded(model, 'findFirst', async (a?: { where?: unknown }) => rows().find((r) => matches(r, a?.where, store)) ?? null),
      findUnique: guarded(model, 'findUnique', async (a?: { where?: unknown }) => rows().find((r) => matches(r, a?.where, store)) ?? null),
      findMany: guarded(model, 'findMany', async (a?: { where?: unknown }) => rows().filter((r) => matches(r, a?.where, store))),
      count: guarded(model, 'count', async (a?: { where?: unknown }) => rows().filter((r) => matches(r, a?.where, store)).length),
      groupBy: guarded(model, 'groupBy', async () => []),
      create: guarded(model, 'create', async (a: { data: Row; select?: unknown; include?: unknown }) => {
        log('create', a);
        const row = { id: `${model}-${++seq}`, ...a.data };
        rows().push(row);
        return row;
      }),
      createMany: guarded(model, 'createMany', async (a: { data: Row[] }) => {
        log('createMany', a);
        for (const data of a.data) rows().push({ id: `${model}-${++seq}`, ...data });
        return { count: a.data.length };
      }),
      update: guarded(model, 'update', async (a: { where: unknown; data: Row }) => {
        log('update', a);
        const row = rows().find((r) => matches(r, a.where, store)) ?? {};
        return { ...row, ...a.data };
      }),
      // `updateMany`/`deleteMany` SÍ mutan el store (como Prisma): así un test puede probar
      // que un filtro de más (p. ej. una tabla hija acotada solo por su padre) borraría filas
      // de otro negocio.
      updateMany: guarded(model, 'updateMany', async (a: { where?: unknown; data: Row }) => {
        log('updateMany', a);
        const hit = rows().filter((r) => matches(r, a.where, store));
        for (const row of hit) Object.assign(row, a.data);
        return { count: hit.length };
      }),
      delete: guarded(model, 'delete', async (a?: unknown) => { log('delete', a); return {}; }),
      deleteMany: guarded(model, 'deleteMany', async (a?: { where?: unknown }) => {
        log('deleteMany', a);
        const before = rows();
        const kept = before.filter((r) => !matches(r, a?.where, store));
        store[model] = kept;
        return { count: before.length - kept.length };
      }),
    };
  };

  // `$queryRaw` / `$queryRawUnsafe` no se ejecutan: se registran (con el SQL ya unido y
  // sus parámetros) y devuelven []. Así los tests pueden comprobar que se emitió un lock
  // de fila (`SELECT … FOR UPDATE`) dentro de la transacción.
  const buildClient = (tag: ClientTag): Record<string, unknown> => new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return undefined; // not a thenable
      if (prop === '$transaction') {
        return async (arg: unknown) => {
          writes.push({ model: '$transaction', op: 'begin', args: null, client: tag });
          // El callback recibe SIEMPRE el cliente de transacción (`tx`), distinto del root.
          return Array.isArray(arg) ? Promise.all(arg) : (arg as (c: unknown) => unknown)(txClient);
        };
      }
      if (prop === '$queryRaw' || prop === '$queryRawUnsafe') {
        return async (query: TemplateStringsArray | string, ...values: unknown[]) => {
          // Los fragmentos `Prisma.raw` (identificadores schema.tabla, no parametrizables)
          // se intercalan en el texto; el resto son parámetros reales → `?` + valor.
          const isRaw = (v: unknown): v is { sql: string } =>
            typeof v === 'object' && v !== null && typeof (v as { sql?: unknown }).sql === 'string';
          const parts = typeof query === 'string' ? [query] : Array.from(query);
          const params: unknown[] = [];
          let sql = parts[0];
          values.forEach((v, i) => {
            if (isRaw(v)) sql += v.sql;
            else { sql += '?'; params.push(v); }
            sql += parts[i + 1] ?? '';
          });
          writes.push({ model: '$queryRaw', op: 'query', args: { query: sql, values: params }, client: tag });
          return [];
        };
      }
      return delegate(prop, tag);
    },
  });

  const txClient = buildClient('tx');
  const client = buildClient('root');

  (globalThis as { prisma?: unknown }).prisma = client;

  return {
    client,
    writes,
    reset(seed: Seed) {
      store = structuredClone(seed);
      writes.length = 0;
    },
    writesTo(model: string) {
      return writes.filter((w) => w.model === model);
    },
  };
}

export interface CallContext { businessId?: string; userId?: string; role?: string }

/** Mounts `router` on a throwaway express app with an injected auth context and performs one HTTP call. */
export async function call(
  router: Router,
  method: string,
  path: string,
  body?: unknown,
  ctx: CallContext = { businessId: 'A', userId: 'uA', role: 'ADMIN' },
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, ctx); next(); });
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}
