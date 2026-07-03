// Tests de CARACTERIZACIÓN del alta de proyecto (POST /projects) — F8-T3.
// Runner: node --import tsx --test
//
// Fijan el comportamiento ACTUAL del create antes de extraerlo a un service
// compartido (aa-operator-agent, alternativa A). Si estos tests se rompen tras
// la extracción, la extracción cambió comportamiento observable: NO editar los
// tests para que encajen. Patrón DI del repo (ver service-operator.test.ts):
// deps inyectadas como dobles, sin BD real.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthedRequest } from '../../middleware/types.js';
import {
  createProjectHandler,
  type CreateProjectDeps,
  type ProjectTxClient,
} from '../projects.js';

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

function mockReq(body: unknown, userId = 'user-1') {
  return { body, userId } as unknown as AuthedRequest;
}

/**
 * Doble del alta: registra cada create (modelo + data) en orden, cuenta las
 * transacciones y permite simular tenant inexistente o fallo de BD.
 */
function fakeDeps(opts: { tenantOk?: boolean; txError?: Error } = {}) {
  const calls: { model: string; data: unknown }[] = [];
  const tenantChecked: string[] = [];
  let txCount = 0;

  const tx: ProjectTxClient = {
    business: {
      create: async (args) => {
        calls.push({ model: 'business', data: args.data });
        return { id: 'biz-1', createdAt: CREATED_AT };
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

  const deps: CreateProjectDeps = {
    tenantExists: async (tenantId) => {
      tenantChecked.push(tenantId);
      return opts.tenantOk ?? true;
    },
    transaction: async (fn) => {
      txCount += 1;
      if (opts.txError) throw opts.txError;
      return fn(tx);
    },
  };

  return { deps, calls, tenantChecked, txCount: () => txCount };
}

// ── Camino feliz ─────────────────────────────────────────────────────────────────
describe('POST /projects — caracterización del create', () => {
  test('crea Business → Location → BusinessSetting(config) → Membership(ADMIN) → VisitStates en 1 transacción', async () => {
    const config = {
      business: { name: 'Peluquería Sol', vertical: 'peluqueria' },
      branding: { primary: '#111111', secondary: '#222222', logoImage: 'data:image/png;base64,x' },
      modules: { agenda: true },
    };
    const f = fakeDeps();
    const res = mockRes();

    await createProjectHandler(f.deps, mockReq({ tenantId: 't-1', config }, 'user-9'), res);

    // Una única transacción envuelve todo el alta.
    assert.equal(f.txCount(), 1);
    // Orden exacto de creación dentro de la transacción.
    assert.deepEqual(
      f.calls.map((c) => c.model),
      ['business', 'location', 'businessSetting', 'membership', 'visitState'],
    );

    // Business: columnas espejo derivadas de la config (branding incluido).
    assert.deepEqual(f.calls[0].data, {
      tenantId: 't-1',
      nombre: 'Peluquería Sol',
      vertical: 'peluqueria',
      marcaPrimario: '#111111',
      marcaSecundario: '#222222',
      logoUrl: 'data:image/png;base64,x',
    });
    // Location: sede inicial con el nombre del negocio.
    assert.deepEqual(f.calls[1].data, { businessId: 'biz-1', nombre: 'Peluquería Sol' });
    // BusinessSetting: la config íntegra bajo categoria 'config'.
    assert.deepEqual(f.calls[2].data, { businessId: 'biz-1', categoria: 'config', datos: config });
    // Membership: rol ADMIN para el userId de la request.
    assert.deepEqual(f.calls[3].data, { userId: 'user-9', businessId: 'biz-1', role: 'ADMIN' });
    // VisitStates: los 5 estados base del comercial, todos de sistema.
    const visitStates = f.calls[4].data as { businessId: string; esSistema: boolean }[];
    assert.equal(visitStates.length, 5);
    assert.ok(visitStates.every((s) => s.businessId === 'biz-1' && s.esSistema === true));

    // Respuesta 201 con id + config + createdAt ISO.
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { id: 'biz-1', config, createdAt: CREATED_AT.toISOString() });
  });

  test('defaults sin config: nombre "Nuevo proyecto", vertical "custom", sede "Sede", sin branding', async () => {
    const f = fakeDeps();
    const res = mockRes();

    await createProjectHandler(f.deps, mockReq({ tenantId: 't-1' }), res);

    // Espejo con defaults y SIN claves de marca (no se envían si no hay branding).
    assert.deepEqual(f.calls[0].data, { tenantId: 't-1', nombre: 'Nuevo proyecto', vertical: 'custom' });
    assert.deepEqual(f.calls[1].data, { businessId: 'biz-1', nombre: 'Sede' });
    // Config vacía persistida tal cual.
    assert.deepEqual(f.calls[2].data, { businessId: 'biz-1', categoria: 'config', datos: {} });
    assert.equal(res.statusCode, 201);
  });

  test('resuelve el tenant desde config.business.clienteId si el body no trae tenantId', async () => {
    const f = fakeDeps();
    const res = mockRes();

    await createProjectHandler(
      f.deps,
      mockReq({ config: { business: { name: 'Bar X', clienteId: 't-77' } } }),
      res,
    );

    assert.deepEqual(f.tenantChecked, ['t-77']);
    assert.equal(res.statusCode, 201);
    assert.equal((f.calls[0].data as { tenantId: string }).tenantId, 't-77');
  });
});

// ── Validaciones y errores ────────────────────────────────────────────────────────
describe('POST /projects — validaciones y errores', () => {
  test('422 tenant_required sin tenantId ni clienteId; no toca la BD', async () => {
    const f = fakeDeps();
    const res = mockRes();

    await createProjectHandler(f.deps, mockReq({ config: {} }), res);

    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_required');
    assert.equal(f.txCount(), 0);
    assert.deepEqual(f.tenantChecked, []);
  });

  test('422 tenant_not_found si el tenant no existe; no abre transacción', async () => {
    const f = fakeDeps({ tenantOk: false });
    const res = mockRes();

    await createProjectHandler(f.deps, mockReq({ tenantId: 't-missing' }), res);

    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_not_found');
    assert.equal(f.txCount(), 0);
  });

  test('500 server_error si la transacción falla, sin filtrar detalles', async () => {
    const f = fakeDeps({ txError: new Error('db down') });
    const res = mockRes();

    await createProjectHandler(f.deps, mockReq({ tenantId: 't-1' }), res);

    assert.equal(res.statusCode, 500);
    const body = res.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'server_error');
    assert.ok(!body.error.message.includes('db down'));
  });
});
