// In-memory Prisma stand-in for route tests that need no database.
// Install it with `installFakePrisma()` BEFORE dynamically importing any module
// that imports `../prisma.js`: the lazy singleton picks up `globalThis.prisma`.
import express, { type Router } from 'express';
import type { AddressInfo } from 'node:net';

type Row = Record<string, unknown>;
export type Seed = Record<string, Row[]>;
export interface Write { model: string; op: string; args: unknown }

function matchValue(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true; // Prisma ignores undefined filters
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
  if (typeof expected === 'object') {
    const ops = expected as Record<string, unknown>;
    if (Array.isArray(ops.in)) return ops.in.includes(actual);
    return true; // relational/range filters are not modelled: treat as match
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

  const delegate = (model: string) => {
    const rows = () => (store[model] ??= []);
    const log = (op: string, args: unknown) => writes.push({ model, op, args });
    return {
      findFirst: async (a?: { where?: unknown }) => rows().find((r) => matches(r, a?.where)) ?? null,
      findUnique: async (a?: { where?: unknown }) => rows().find((r) => matches(r, a?.where)) ?? null,
      findMany: async (a?: { where?: unknown }) => rows().filter((r) => matches(r, a?.where)),
      count: async (a?: { where?: unknown }) => rows().filter((r) => matches(r, a?.where)).length,
      groupBy: async () => [],
      create: async (a: { data: Row }) => {
        log('create', a);
        const row = { id: `${model}-${++seq}`, ...a.data };
        rows().push(row);
        return row;
      },
      update: async (a: { where: unknown; data: Row }) => {
        log('update', a);
        const row = rows().find((r) => matches(r, a.where)) ?? {};
        return { ...row, ...a.data };
      },
      delete: async (a: unknown) => { log('delete', a); return {}; },
    };
  };

  const client: Record<string, unknown> = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === '$transaction') {
        return async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (c: unknown) => unknown)(client));
      }
      if (prop === 'then') return undefined; // not a thenable
      return delegate(prop);
    },
  });

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
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}
