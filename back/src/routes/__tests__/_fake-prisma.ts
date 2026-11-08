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
    return true; // resto de filtros relacionales (relaciones anidadas): treat as match
  }
  return actual === expected;
}

function matches(row: Row, where: unknown): boolean {
  if (!where || typeof where !== 'object') return true;
  return Object.entries(where as Row).every(([k, v]) => matchValue(row[k], v));
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
      findFirst: guarded(model, 'findFirst', async (a?: { where?: unknown }) => rows().find((r) => matches(r, a?.where)) ?? null),
      findUnique: guarded(model, 'findUnique', async (a?: { where?: unknown }) => rows().find((r) => matches(r, a?.where)) ?? null),
      findMany: guarded(model, 'findMany', async (a?: { where?: unknown }) => rows().filter((r) => matches(r, a?.where))),
      count: guarded(model, 'count', async (a?: { where?: unknown }) => rows().filter((r) => matches(r, a?.where)).length),
      groupBy: guarded(model, 'groupBy', async () => []),
      create: guarded(model, 'create', async (a: { data: Row; select?: unknown; include?: unknown }) => {
        log('create', a);
        const row = { id: `${model}-${++seq}`, ...a.data };
        rows().push(row);
        return row;
      }),
      update: guarded(model, 'update', async (a: { where: unknown; data: Row }) => {
        log('update', a);
        const row = rows().find((r) => matches(r, a.where)) ?? {};
        return { ...row, ...a.data };
      }),
      delete: guarded(model, 'delete', async (a?: unknown) => { log('delete', a); return {}; }),
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
