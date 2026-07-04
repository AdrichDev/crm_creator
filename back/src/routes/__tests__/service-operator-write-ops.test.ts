// Unit tests de las escrituras del operador (crm-operator-bot-write-ops):
// GET /tenants, GET/POST /customers, GET/POST /invoices, GET/POST /sales.
// Runner: node --import tsx --test
//
// Mismo patrón DI que service-operator.test.ts: BD inyectada como doble, sin
// levantar servidor ni credenciales. El middleware de token ya está cubierto
// en service-operator.test.ts (requireOperatorToken) — aquí se ejercitan los
// handlers directamente, que es lo que el 401 de la suite de middleware ya
// garantiza para TODO el router (serviceOperatorRouter.use(requireOperatorToken())).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  tenantsHandler,
  customersListHandler,
  customersCreateHandler,
  invoicesListHandler,
  invoicesCreateHandler,
  salesListHandler,
  salesCreateHandler,
  type OperatorWriteDb,
  type OperatorWriteTx,
} from '../service-operator.js';

// ── Helpers de req/res simulados ───────────────────────────────────────────────
function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

function mockReq(opts: { query?: Record<string, unknown>; body?: unknown } = {}) {
  return { query: opts.query ?? {}, body: opts.body } as unknown as Request;
}

const ACTIVE_BUSINESS = 'biz-1';

/** Doble mínimo de OperatorWriteDb: un único negocio activo, resto configurable por test. */
function fakeDb(overrides: Partial<OperatorWriteDb> = {}): OperatorWriteDb {
  const db: OperatorWriteDb = {
    business: {
      findFirst: async ({ where }) => (where.id === ACTIVE_BUSINESS ? { id: ACTIVE_BUSINESS } : null),
    },
    customer: {
      findMany: async () => [],
      create: async () => ({ id: 'cust-new' }),
    },
    invoice: {
      findMany: async () => [],
      count: async () => 0,
      create: async () => ({ id: 'inv-new', numero: 'F00001' }),
    },
    sale: {
      findMany: async () => [],
      create: async () => ({ id: 'sale-new' }),
    },
    $queryRaw: (async () => []) as OperatorWriteDb['$queryRaw'],
    // Default: delega en `db.invoice`/`db.$queryRaw` para que los overrides de
    // arriba (o los que pase cada test) se reflejen también dentro de la
    // "transacción" — mismo comportamiento visible que Prisma real, sin BD.
    $transaction: (async (fn) =>
      fn({
        invoice: {
          count: (args) => db.invoice.count(args),
          create: (args) => db.invoice.create(args),
        },
        $queryRaw: ((...args: Parameters<OperatorWriteDb['$queryRaw']>) =>
          db.$queryRaw(...args)) as OperatorWriteDb['$queryRaw'],
      })) as OperatorWriteDb['$transaction'],
    ...overrides,
  };
  return db;
}

// ── GET /tenants ─────────────────────────────────────────────────────────────────
describe('GET /tenants', () => {
  test('200: lista tenants activos vía $queryRaw', async () => {
    const rows = [{ id: 't1', nombre: 'Cliente Uno' }];
    const db = fakeDb({ $queryRaw: (async () => rows) as OperatorWriteDb['$queryRaw'] });
    const res = mockRes();
    await tenantsHandler(db, mockReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { tenants: rows });
  });

  test('500 si la BD falla, sin filtrar detalles', async () => {
    const db = fakeDb({ $queryRaw: (async () => { throw new Error('db down'); }) as OperatorWriteDb['$queryRaw'] });
    const res = mockRes();
    await tenantsHandler(db, mockReq(), res);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error: { code: string } }).error.code, 'server_error');
  });
});

// ── GET /customers ───────────────────────────────────────────────────────────────
describe('GET /customers', () => {
  test('200: lista clientes del negocio activo', async () => {
    const db = fakeDb({
      customer: {
        findMany: async () => [{ id: 'c1', nombre: 'Ana', apellido: 'Pérez', telefono: '600', email: null }],
        create: async () => ({ id: 'cust-new' }),
      },
    });
    const res = mockRes();
    await customersListHandler(db, mockReq({ query: { businessId: ACTIVE_BUSINESS } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { customers: [{ id: 'c1', nombre: 'Ana Pérez', telefono: '600', email: null }] });
  });

  test('404 si businessId no existe o está inactivo', async () => {
    const db = fakeDb();
    const res = mockRes();
    await customersListHandler(db, mockReq({ query: { businessId: 'nope' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'business_not_found');
  });

  test('404 si falta businessId', async () => {
    const db = fakeDb();
    const res = mockRes();
    await customersListHandler(db, mockReq({ query: {} }), res);
    assert.equal(res.statusCode, 404);
  });
});

// ── POST /customers ──────────────────────────────────────────────────────────────
describe('POST /customers', () => {
  test('201: crea cliente y devuelve { id }', async () => {
    const created: { data?: unknown } = {};
    const db = fakeDb({
      customer: {
        findMany: async () => [],
        create: async (args) => { created.data = args.data; return { id: 'cust-new' }; },
      },
    });
    const res = mockRes();
    await customersCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, nombre: 'Ana Pérez', telefono: '600' } }), res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { id: 'cust-new' });
    assert.deepEqual(created.data, { businessId: ACTIVE_BUSINESS, nombre: 'Ana', apellido: 'Pérez', telefono: '600', email: null });
  });

  test('404 si businessId no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await customersCreateHandler(db, mockReq({ body: { businessId: 'nope', nombre: 'Ana' } }), res);
    assert.equal(res.statusCode, 404);
  });

  test('422 si falta nombre', async () => {
    const db = fakeDb();
    const res = mockRes();
    await customersCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS } }), res);
    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid');
  });
});

// ── GET /invoices ─────────────────────────────────────────────────────────────────
describe('GET /invoices', () => {
  test('200: lista facturas del negocio activo', async () => {
    const createdAt = new Date('2026-07-01T00:00:00Z');
    const db = fakeDb({
      invoice: {
        findMany: async () => [{ id: 'i1', cliente: 'Ana', numero: 'F00001', total: 100, createdAt }],
        count: async () => 1,
        create: async () => ({ id: 'inv-new', numero: 'F00002' }),
      },
    });
    const res = mockRes();
    await invoicesListHandler(db, mockReq({ query: { businessId: ACTIVE_BUSINESS } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { invoices: [{ id: 'i1', cliente: 'Ana', numero: 'F00001', total: 100, createdAt: createdAt.toISOString() }] });
  });

  test('404 si businessId no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await invoicesListHandler(db, mockReq({ query: { businessId: 'nope' } }), res);
    assert.equal(res.statusCode, 404);
  });
});

// ── POST /invoices ────────────────────────────────────────────────────────────────
describe('POST /invoices', () => {
  test('201: crea factura con numero server-assigned secuencial', async () => {
    const created: { data?: Record<string, unknown> } = {};
    const db = fakeDb({
      invoice: {
        findMany: async () => [],
        count: async () => 4, // ya hay 4 facturas → la próxima es F00005
        create: async (args) => { created.data = args.data as Record<string, unknown>; return { id: 'inv-new', numero: args.data.numero as string }; },
      },
    });
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', servicio: 'Corte', total: 30 } }), res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { id: 'inv-new', numero: 'F00005' });
    assert.equal(created.data?.cliente, 'Ana');
    assert.equal(created.data?.servicio, 'Corte');
    assert.equal(created.data?.total, 30);
    assert.equal(created.data?.estado, 'Pendiente');
  });

  // crm-paridad-facturas-pedidos-aa (Fase 1.1): fija explícitamente el caso base
  // de la numeración F00001 — la primera factura de un negocio (count=0) recibe
  // literalmente 'F00001', no 'F00000' ni 'F1'. El resto de la suite ya cubre
  // el caso general (count=N → F0000N+1) y la exclusividad bajo concurrencia.
  test('primera factura de un negocio (sin facturas previas) recibe numero "F00001"', async () => {
    const created: { numero?: string } = {};
    const db = fakeDb({
      invoice: {
        findMany: async () => [],
        count: async () => 0, // negocio sin facturas todavía
        create: async (args) => {
          created.numero = (args.data as Record<string, unknown>).numero as string;
          return { id: 'inv-first', numero: created.numero! };
        },
      },
    });
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: 30 } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(created.numero, 'F00001');
    assert.deepEqual(res.body, { id: 'inv-first', numero: 'F00001' });
  });

  test('404 si businessId no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: 'nope', cliente: 'Ana', total: 30 } }), res);
    assert.equal(res.statusCode, 404);
  });

  test('422 si falta cliente', async () => {
    const db = fakeDb();
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, total: 30 } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('422 si total no es un número válido', async () => {
    const db = fakeDb();
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: 'x' } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('422 si total es negativo', async () => {
    const db = fakeDb();
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: -5 } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('422 si cliente es blanco (solo espacios)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: '   ', total: 30 } }), res);
    assert.equal(res.statusCode, 422);
  });

  // ── Regresión: race condition en la numeración (fix 2026-07-03) ──────────
  // Antes: count()+create() sueltos → dos POST concurrentes leen el mismo
  // count y generan el mismo `numero`. Ahora: todo dentro de $transaction con
  // lock de fila (mismo patrón que sale-lines.ts / lockSale).
  test('usa $transaction con lock ANTES de leer el count (no count()+create() sueltos)', async () => {
    const queries: string[] = [];
    const created: string[] = [];
    const db = fakeDb({
      // Si el handler llamara a count()/create() del nivel superior (fuera de
      // la transacción) esto debe reventar el test.
      invoice: {
        findMany: async () => [],
        count: async () => { throw new Error('no debe llamarse invoice.count() fuera de $transaction'); },
        create: async () => { throw new Error('no debe llamarse invoice.create() fuera de $transaction'); },
      },
      $transaction: (async (fn) => {
        let locked = false;
        return fn({
          invoice: {
            count: async () => {
              assert.equal(locked, true, 'count() debe ejecutarse DESPUÉS del lock (FOR UPDATE)');
              return 3;
            },
            create: async (args) => {
              const numero = (args.data as Record<string, unknown>).numero as string;
              created.push(numero);
              return { id: 'inv-x', numero };
            },
          },
          $queryRaw: (async (query: TemplateStringsArray) => {
            locked = true;
            queries.push(query.join(''));
            return [];
          }) as OperatorWriteDb['$queryRaw'],
        });
      }) as OperatorWriteDb['$transaction'],
    });
    const res = mockRes();
    await invoicesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: 30 } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(queries.length, 1, 'debe tomar el lock exactamente una vez');
    assert.match(queries[0], /FOR UPDATE/);
    assert.deepEqual(created, ['F00004']);
  });

  test('dos (o más) creaciones concurrentes para el mismo negocio no producen numero duplicado', async () => {
    // Emula la serialización que da Postgres con `SELECT ... FOR UPDATE`: cada
    // $transaction espera a que la anterior termine antes de leer el count
    // compartido. Si el handler bajo prueba hiciera count()+create() sin pasar
    // por $transaction, este doble usaría el stub por defecto (numero fijo
    // 'F00001') y las 3 llamadas colisionarían.
    let sharedCount = 0;
    let mutex: Promise<unknown> = Promise.resolve();
    const numeros: string[] = [];

    function withLock<T>(fn: () => Promise<T>): Promise<T> {
      const run = mutex.then(fn, fn);
      mutex = run.then(() => undefined, () => undefined);
      return run;
    }

    const db = fakeDb({
      $transaction: (async (fn) =>
        withLock(() =>
          fn({
            invoice: {
              count: async () => sharedCount,
              create: async (args) => {
                const numero = (args.data as Record<string, unknown>).numero as string;
                numeros.push(numero);
                sharedCount += 1;
                return { id: `inv-${sharedCount}`, numero };
              },
            },
            $queryRaw: (async () => []) as OperatorWriteDb['$queryRaw'],
          }),
        )) as OperatorWriteDb['$transaction'],
    });

    const makeReq = () => mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: 10 } });
    await Promise.all([
      invoicesCreateHandler(db, makeReq(), mockRes()),
      invoicesCreateHandler(db, makeReq(), mockRes()),
      invoicesCreateHandler(db, makeReq(), mockRes()),
    ]);

    assert.equal(numeros.length, 3);
    assert.equal(new Set(numeros).size, 3, `numeros duplicados: ${numeros.join(', ')}`);
  });
});

// ── GET /sales ────────────────────────────────────────────────────────────────────
describe('GET /sales', () => {
  test('200: lista ventas del negocio activo', async () => {
    const createdAt = new Date('2026-07-01T00:00:00Z');
    const db = fakeDb({
      sale: {
        findMany: async () => [{ id: 's1', cliente: 'Ana', total: 50, createdAt }],
        create: async () => ({ id: 'sale-new' }),
      },
    });
    const res = mockRes();
    await salesListHandler(db, mockReq({ query: { businessId: ACTIVE_BUSINESS } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { sales: [{ id: 's1', cliente: 'Ana', total: 50, createdAt: createdAt.toISOString() }] });
  });

  test('404 si businessId no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await salesListHandler(db, mockReq({ query: { businessId: 'nope' } }), res);
    assert.equal(res.statusCode, 404);
  });
});

// ── POST /sales ───────────────────────────────────────────────────────────────────
describe('POST /sales', () => {
  test('201: crea venta y devuelve { id }', async () => {
    const created: { data?: unknown } = {};
    const db = fakeDb({
      sale: {
        findMany: async () => [],
        create: async (args) => { created.data = args.data; return { id: 'sale-new' }; },
      },
    });
    const res = mockRes();
    await salesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: 50 } }), res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { id: 'sale-new' });
    assert.deepEqual(created.data, { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: 50 });
  });

  test('404 si businessId no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await salesCreateHandler(db, mockReq({ body: { businessId: 'nope', cliente: 'Ana', total: 50 } }), res);
    assert.equal(res.statusCode, 404);
  });

  test('422 si falta cliente', async () => {
    const db = fakeDb();
    const res = mockRes();
    await salesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, total: 50 } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('422 si total es negativo', async () => {
    const db = fakeDb();
    const res = mockRes();
    await salesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: 'Ana', total: -5 } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('422 si cliente es blanco (solo espacios)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await salesCreateHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, cliente: '   ', total: 50 } }), res);
    assert.equal(res.statusCode, 422);
  });
});
