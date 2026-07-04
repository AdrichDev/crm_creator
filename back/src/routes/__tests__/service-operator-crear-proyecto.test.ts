// Unit tests de POST /service/operator/proyectos (F8-T3 aa-operator-agent).
// Runner: node --import tsx --test
//
// Patrón DI del repo (ver service-operator.test.ts): deps inyectadas como dobles,
// sin BD real. Se verifica la disciplina de escritura del operador: confirmación
// en 2 pasos (409), owner por env fail-closed (500), tenant validado (422),
// idempotencia por (tenantId, nombre, ventana) y creación por el service compartido.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { crearProyectoHandler, type OperatorCreateDeps } from '../service-operator.js';
import type { ProjectTxClient } from '../../lib/projects/create-project-service.js';

const CREATED_AT = new Date('2026-07-03T10:00:00Z');

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

function mockReq(body: unknown) {
  return { body } as unknown as Request;
}

/**
 * Doble de deps del alta vía operador: registra creaciones, transacciones y
 * lookups de idempotencia; permite simular owner sin configurar, tenant
 * inexistente y duplicado reciente.
 */
function fakeDeps(opts: {
  ownerUserId?: string;
  tenantOk?: boolean;
  recent?: { id: string; createdAt: Date } | null;
  balance?: number | null; // saldo del tenant; undefined = sobrado, null = sin fila
} = {}) {
  const calls: { model: string; data: unknown }[] = [];
  const findRecentArgs: { tenantId: string; nombre: string; since: Date }[] = [];
  const chargeCalls: { tenantId: string; cost: number; context: { projectId: string; modulesCount: number } }[] = [];
  let txCount = 0;

  const tx: ProjectTxClient = {
    business: {
      create: async (args) => {
        calls.push({ model: 'business', data: args.data });
        return { id: 'biz-new', createdAt: CREATED_AT };
      },
    },
    location: {
      create: async (args) => {
        calls.push({ model: 'location', data: args.data });
        return {};
      },
    },
    businessSetting: {
      create: async (args) => {
        calls.push({ model: 'businessSetting', data: args.data });
        return {};
      },
    },
    membership: {
      create: async (args) => {
        calls.push({ model: 'membership', data: args.data });
        return {};
      },
    },
    visitState: {
      createMany: async (args) => {
        calls.push({ model: 'visitState', data: args.data });
        return { count: args.data.length };
      },
    },
  };

  const deps: OperatorCreateDeps = {
    ownerUserId: () => opts.ownerUserId ?? 'owner-adrian',
    tenantExists: async () => opts.tenantOk ?? true,
    transaction: async (fn) => {
      txCount += 1;
      return fn(tx);
    },
    findRecentProject: async (tenantId, nombre, since) => {
      findRecentArgs.push({ tenantId, nombre, since });
      return opts.recent ?? null;
    },
    fetchBalance: async () => {
      if (opts.balance === undefined) return { saldo: 1_000_000 }; // saldo sobrado por defecto
      if (opts.balance === null) return null; // tenant sin fila
      return { saldo: opts.balance };
    },
    // Best-effort real: el double nunca lanza (contrato de chargeTokensForProject).
    chargeTokens: async (tenantId, cost, context) => {
      chargeCalls.push({ tenantId, cost, context });
    },
  };

  return { deps, calls, chargeCalls, findRecentArgs, txCount: () => txCount };
}

// ── Gate de confirmación (escritura en 2 pasos) ───────────────────────────────────
describe('POST /proyectos (operator) — gate de confirmación', () => {
  test('409 PENDIENTE_CONFIRMACION sin confirmado=true; NO escribe ni consulta', async () => {
    const f = fakeDeps();
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config: {} }), res);

    assert.equal(res.statusCode, 409);
    assert.equal((res.body as { error: { code: string } }).error.code, 'PENDIENTE_CONFIRMACION');
    assert.equal(f.txCount(), 0);
    assert.equal(f.calls.length, 0);
    assert.equal(f.findRecentArgs.length, 0);
  });

  test('409 también con confirmado truthy pero no estrictamente true (ej. "true")', async () => {
    const f = fakeDeps();
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config: {}, confirmado: 'true' }), res);

    assert.equal(res.statusCode, 409);
    assert.equal(f.txCount(), 0);
  });
});

// ── Owner fail-closed ─────────────────────────────────────────────────────────────
describe('POST /proyectos (operator) — owner por env fail-closed', () => {
  test('500 operator_owner_unset si OPERATOR_OWNER_USER_ID está vacío; nunca crea', async () => {
    const f = fakeDeps({ ownerUserId: '' });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config: {}, confirmado: true }), res);

    assert.equal(res.statusCode, 500);
    const body = res.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'operator_owner_unset');
    // El mensaje no filtra el nombre exacto de la env ni valores internos.
    assert.ok(!body.error.message.includes('OPERATOR_OWNER_USER_ID'));
    assert.equal(f.txCount(), 0);
    assert.equal(f.calls.length, 0);
  });
});

// ── Validación de tenant ──────────────────────────────────────────────────────────
describe('POST /proyectos (operator) — validación de tenant', () => {
  test('422 tenant_required sin tenantId ni clienteId', async () => {
    const f = fakeDeps();
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ config: {}, confirmado: true }), res);

    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_required');
    assert.equal(f.txCount(), 0);
  });

  test('422 tenant_not_found si el tenant no existe en AA; no abre transacción', async () => {
    const f = fakeDeps({ tenantOk: false });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-missing', config: {}, confirmado: true }), res);

    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_not_found');
    assert.equal(f.txCount(), 0);
  });
});

// ── Camino feliz e idempotencia ───────────────────────────────────────────────────
describe('POST /proyectos (operator) — alta e idempotencia', () => {
  test('201 crea por el MISMO camino que el front, con Membership del owner del operador', async () => {
    const config = { business: { name: 'Clínica Delta', vertical: 'clinica' } };
    const f = fakeDeps({ ownerUserId: 'owner-adrian' });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config, confirmado: true }), res);

    assert.equal(res.statusCode, 201);
    // config sin módulos → coste base 100; la respuesta incluye tokensDeducted.
    assert.deepEqual(res.body, { id: 'biz-new', config, createdAt: CREATED_AT.toISOString(), tokensDeducted: 100 });
    // Mismo pipeline que POST /projects: 1 transacción, mismo orden de creación.
    assert.equal(f.txCount(), 1);
    assert.deepEqual(
      f.calls.map((c) => c.model),
      ['business', 'location', 'businessSetting', 'membership', 'visitState'],
    );
    // El Membership ADMIN es del owner resuelto por env, no de un usuario de request.
    assert.deepEqual(f.calls[3].data, { userId: 'owner-adrian', businessId: 'biz-new', role: 'ADMIN' });
    // La idempotencia se consultó con el nombre espejo y la ventana de 5 min.
    assert.equal(f.findRecentArgs.length, 1);
    assert.equal(f.findRecentArgs[0].tenantId, 't-1');
    assert.equal(f.findRecentArgs[0].nombre, 'Clínica Delta');
    const windowMs = Date.now() - f.findRecentArgs[0].since.getTime();
    assert.ok(windowMs >= 4.9 * 60 * 1000 && windowMs <= 5.1 * 60 * 1000);
  });

  test('200 con el proyecto existente si hay duplicado en la ventana; NO crea otro', async () => {
    const recent = { id: 'biz-prev', createdAt: new Date('2026-07-03T09:58:00Z') };
    const config = { business: { name: 'Clínica Delta' } };
    const f = fakeDeps({ recent });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config, confirmado: true }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { id: 'biz-prev', config, createdAt: recent.createdAt.toISOString() });
    // Sin segunda creación: ni transacción ni writes.
    assert.equal(f.txCount(), 0);
    assert.equal(f.calls.length, 0);
  });

  test('resuelve el tenant desde config.business.clienteId si el body no trae tenantId', async () => {
    const f = fakeDeps();
    const res = mockRes();

    await crearProyectoHandler(
      f.deps,
      mockReq({ config: { business: { name: 'Bar X', clienteId: 't-77' } }, confirmado: true }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal((f.calls[0].data as { tenantId: string }).tenantId, 't-77');
  });

  test('500 server_error si la BD falla, sin filtrar detalles', async () => {
    const f = fakeDeps();
    f.deps.transaction = async () => {
      throw new Error('db down: postgres://user:pass@host');
    };
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config: {}, confirmado: true }), res);

    assert.equal(res.statusCode, 500);
    const body = res.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'server_error');
    assert.ok(!body.error.message.includes('postgres://'));
  });
});

// ── Metering de tokens (aa-token-metering-crm, AC1-AC4) ────────────────────────────
describe('POST /proyectos (operator) — metering de tokens', () => {
  test('AC1: saldo suficiente → 201 + tokensDeducted correcto + cobro con contexto', async () => {
    // 3 módulos → coste 100 + 3*50 = 250.
    const config = { business: { name: 'Clínica Delta' }, modules: ['a', 'b', 'c'] };
    const f = fakeDeps({ balance: 10_000 });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config, confirmado: true }), res);

    assert.equal(res.statusCode, 201);
    assert.equal((res.body as { tokensDeducted: number }).tokensDeducted, 250);
    // El proyecto se creó (transacción del service) y el cobro se llamó una vez.
    assert.equal(f.txCount(), 1);
    assert.equal(f.chargeCalls.length, 1);
    assert.deepEqual(f.chargeCalls[0], {
      tenantId: 't-1',
      cost: 250,
      context: { projectId: 'biz-new', modulesCount: 3 },
    });
  });

  test('AC2: saldo < costo → 402 insufficient_tokens; NO crea ni cobra', async () => {
    const config = { business: { name: 'Bar Z' }, modules: ['x', 'y'] }; // coste 200
    const f = fakeDeps({ balance: 199 });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config, confirmado: true }), res);

    assert.equal(res.statusCode, 402);
    assert.equal((res.body as { error: { code: string } }).error.code, 'insufficient_tokens');
    // Corte pre-creación: ni transacción del service ni cobro.
    assert.equal(f.txCount(), 0);
    assert.equal(f.calls.length, 0);
    assert.equal(f.chargeCalls.length, 0);
  });

  test('AC2 borde: saldo == costo → 201 (solo corta si saldo < costo)', async () => {
    const config = { business: { name: 'Justo' }, modules: ['x'] }; // coste 150
    const f = fakeDeps({ balance: 150 });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config, confirmado: true }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(f.chargeCalls.length, 1);
  });

  test('balance null (tenant sin fila) NO corta con 402: sigue al 422 tenant_not_found del service', async () => {
    const config = { business: { name: 'Fantasma' } };
    const f = fakeDeps({ balance: null, tenantOk: false });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-x', config, confirmado: true }), res);

    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_not_found');
    assert.equal(f.chargeCalls.length, 0);
  });

  test('AC4: sin tenantId en body, resuelto por config.business.clienteId → se cobra sobre ESE tenant', async () => {
    const config = { business: { name: 'Bar X', clienteId: 't-77' }, modules: ['m'] }; // coste 150
    const f = fakeDeps({ balance: 10_000 });
    const res = mockRes();

    await crearProyectoHandler(
      f.deps,
      mockReq({ config, confirmado: true }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal((res.body as { tokensDeducted: number }).tokensDeducted, 150);
    assert.equal(f.chargeCalls.length, 1);
    assert.equal(f.chargeCalls[0].tenantId, 't-77');
  });

  test('T4.6: cobro best-effort — aunque el cargo esté en curso, la respuesta es 201 con tokensDeducted', async () => {
    // chargeTokens nunca lanza (contrato best-effort). Aun si su deducción real
    // fallara en silencio, el handler debe responder 201 con el coste calculado.
    const config = { business: { name: 'Resiliente' }, modules: ['a'] }; // coste 150
    const f = fakeDeps({ balance: 10_000 });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config, confirmado: true }), res);

    assert.equal(res.statusCode, 201);
    assert.equal((res.body as { tokensDeducted: number }).tokensDeducted, 150);
  });

  test('duplicado en ventana NO cobra tokens (idempotencia)', async () => {
    const recent = { id: 'biz-prev', createdAt: new Date('2026-07-03T09:58:00Z') };
    const config = { business: { name: 'Clínica Delta' }, modules: ['a', 'b'] };
    const f = fakeDeps({ recent, balance: 10_000 });
    const res = mockRes();

    await crearProyectoHandler(f.deps, mockReq({ tenantId: 't-1', config, confirmado: true }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(f.chargeCalls.length, 0);
  });
});
