// Unit tests del router /service/operator (F1/F7 aa-operator-agent, lado CRM).
// Runner: node --import tsx --test
//
// Estrategia (patrón del repo, ver lib/__tests__/middleware-auth.test.ts): la BD se
// inyecta como doble (DI) y el token del middleware es inyectable, así que se ejercita
// la lógica REAL de los handlers sin BD ni credenciales. Solo lectura: no hay escrituras
// que auditar. El cruce cross-schema con aa.tenant va por $queryRaw, que se mockea.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { requireOperatorToken } from '../../middleware/operator-token.js';
import {
  estadoHandler,
  proyectosHandler,
  negociosHandler,
  type OperatorDb,
} from '../service-operator.js';

const TOKEN = 'operator-secret-token-123';

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

function mockReq(headers: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { header: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

/** $queryRaw que devuelve una respuesta fija y captura el SQL de la última llamada. */
function fakeQueryRaw(rows: unknown[]) {
  const calls: string[] = [];
  const fn = (async (strings: TemplateStringsArray) => {
    calls.push(strings.join(' '));
    return rows;
  }) as OperatorDb['$queryRaw'];
  return { fn, calls };
}

// ── Middleware: service token ───────────────────────────────────────────────────
describe('requireOperatorToken', () => {
  const mw = requireOperatorToken(TOKEN);

  test('401 sin header x-service-token', () => {
    const res = mockRes();
    let nextCalled = false;
    mw(mockReq(), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.ok(!nextCalled);
  });

  test('401 con token incorrecto', () => {
    const res = mockRes();
    let nextCalled = false;
    mw(mockReq({ 'x-service-token': 'wrong' }), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.ok(!nextCalled);
  });

  test('401 fail-closed si OPERATOR_SERVICE_TOKEN no está configurado', () => {
    const res = mockRes();
    let nextCalled = false;
    requireOperatorToken('')(mockReq({ 'x-service-token': '' }), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.ok(!nextCalled);
  });

  test('continúa (next) con token correcto', () => {
    const res = mockRes();
    let nextCalled = false;
    mw(mockReq({ 'x-service-token': TOKEN }), res, () => { nextCalled = true; });
    assert.ok(nextCalled);
    assert.equal(res.statusCode, 200); // status() nunca se tocó
  });
});

// ── GET /estado ─────────────────────────────────────────────────────────────────
describe('GET /estado', () => {
  test('devuelve métricas de proyectos con los filtros correctos', async () => {
    const countWheres: unknown[] = [];
    const raw = fakeQueryRaw([{ n: 2 }]); // 2 clientes distintos con proyecto
    const db: OperatorDb = {
      business: {
        // total = tenant_id not null + activo; generados = además generado_en not null.
        count: async (args) => {
          countWheres.push(args.where);
          return args.where.generadoEn ? 3 : 10;
        },
        findMany: async () => [],
      },
      $queryRaw: raw.fn,
    };
    const res = mockRes();

    await estadoHandler(db, mockReq(), res);

    assert.deepEqual(res.body, {
      totalProyectos: 10,
      proyectosGenerados: 3,
      clientesConProyecto: 2,
    });
    // total: solo proyectos reales y activos.
    assert.deepEqual(countWheres[0], { tenantId: { not: null }, eliminadoEn: null });
    // generados: además con paquete creado.
    assert.deepEqual(countWheres[1], { tenantId: { not: null }, eliminadoEn: null, generadoEn: { not: null } });
    // clientesConProyecto se resuelve por COUNT(DISTINCT tenant_id) en SQL.
    assert.match(raw.calls[0], /COUNT\(DISTINCT tenant_id\)/);
    assert.match(raw.calls[0], /tenant_id IS NOT NULL/);
  });

  test('500 si la BD falla, sin filtrar detalles', async () => {
    const db: OperatorDb = {
      business: { count: async () => { throw new Error('db down'); }, findMany: async () => [] },
      $queryRaw: fakeQueryRaw([]).fn,
    };
    const res = mockRes();
    await estadoHandler(db, mockReq(), res);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error: { code: string } }).error.code, 'server_error');
  });
});

// ── GET /proyectos ───────────────────────────────────────────────────────────────
describe('GET /proyectos', () => {
  test('lista proyectos reales con cliente y flag generado; filtro y cruce en SQL', async () => {
    const raw = fakeQueryRaw([
      {
        negocioId: 'b1', nombre: 'Estudio Lúa', vertical: 'peluqueria',
        cliente: 'Cliente Uno', codigoCliente: 'CLI-001',
        generadoEn: new Date('2026-07-01T00:00:00Z'), createdAt: new Date('2026-07-02T00:00:00Z'),
      },
      {
        negocioId: 'b2', nombre: 'Barbería X', vertical: 'barberia',
        cliente: null, codigoCliente: null, // tenant sin match en aa.tenant
        generadoEn: null, createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    ]);
    const db: OperatorDb = {
      business: { count: async () => 0, findMany: async () => [] },
      $queryRaw: raw.fn,
    };
    const res = mockRes();

    await proyectosHandler(db, mockReq(), res);

    const body = res.body as { proyectos: unknown[] };
    assert.equal(body.proyectos.length, 2);
    assert.deepEqual(body.proyectos[0], {
      negocioId: 'b1', nombre: 'Estudio Lúa', vertical: 'peluqueria',
      cliente: 'Cliente Uno', codigoCliente: 'CLI-001',
      generado: true, createdAt: new Date('2026-07-02T00:00:00Z'),
    });
    // generado_en null → generado:false; cliente sin match → null.
    assert.deepEqual(body.proyectos[1], {
      negocioId: 'b2', nombre: 'Barbería X', vertical: 'barberia',
      cliente: null, codigoCliente: null,
      generado: false, createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    // El filtro "solo negocios con tenant_id" y el cruce con el cliente viven en el SQL.
    assert.match(raw.calls[0], /aa\.tenant/);
    assert.match(raw.calls[0], /n\.tenant_id IS NOT NULL/);
  });

  test('500 si la BD falla, sin filtrar detalles', async () => {
    const db: OperatorDb = {
      business: { count: async () => 0, findMany: async () => [] },
      $queryRaw: (async () => { throw new Error('db down'); }) as OperatorDb['$queryRaw'],
    };
    const res = mockRes();
    await proyectosHandler(db, mockReq(), res);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error: { code: string } }).error.code, 'server_error');
  });
});

// ── GET /negocios ────────────────────────────────────────────────────────────────
describe('GET /negocios', () => {
  test('lista negocios activos con solo campos no sensibles', async () => {
    let findManyArgs: { where: unknown; select: unknown } | undefined;
    const rows = [
      { id: 'b1', nombre: 'Estudio Lúa', vertical: 'peluqueria', plan: 'starter', createdAt: new Date('2026-06-01T00:00:00Z') },
    ];
    const db: OperatorDb = {
      business: {
        count: async () => rows.length,
        findMany: async (args) => {
          findManyArgs = args;
          return rows;
        },
      },
      $queryRaw: fakeQueryRaw([]).fn,
    };
    const res = mockRes();

    await negociosHandler(db, mockReq(), res);

    assert.deepEqual(res.body, { negocios: rows });
    // Solo negocios activos.
    assert.deepEqual(findManyArgs?.where, { eliminadoEn: null });
    // El select NO expone campos sensibles (tenantId, nif, config, marca…).
    const selectKeys = Object.keys(findManyArgs?.select as Record<string, unknown>).sort();
    assert.deepEqual(selectKeys, ['createdAt', 'id', 'nombre', 'plan', 'vertical']);
  });
});
