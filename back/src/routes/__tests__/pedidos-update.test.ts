// Unit tests de buildPedidosOrderBy (ordenación por cabecera) y del handler PATCH /pedidos/:id
// (edición documental persistente). Runner: node --import tsx --test. Mismo patrón DI que
// pedidos-status.test.ts: BD inyectada como doble, sin servidor ni BD.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthedRequest } from '../../middleware/types.js';
import {
  buildPedidosOrderBy,
  pedidoUpdateHandler,
  type PedidoUpdateDb,
} from '../pedidos.js';

function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number; body?: unknown;
    status(code: number): typeof res; json(body: unknown): typeof res;
  };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function mockReq(opts: { params?: Record<string, string>; body?: unknown; businessId?: string } = {}): AuthedRequest {
  return {
    params: opts.params ?? { id: 'ped-1' },
    body: opts.body,
    businessId: opts.businessId ?? 'biz-1',
  } as unknown as AuthedRequest;
}

const ACTIVE = 'biz-1';

type PedidoRow = { id: string; estado: string; tasaIva: number; invoice: { id: string } | null };

function pedidoRow(overrides: Partial<PedidoRow> = {}): PedidoRow {
  return { id: 'ped-1', estado: 'generada', tasaIva: 0.21, invoice: null, ...overrides };
}

// Doble de BD: findFirst devuelve la fila (o null); update registra la `data` recibida.
function fakeDb(opts: {
  found?: PedidoRow | null;
  customerFound?: { id: string } | null;
  calls?: { updateData?: Record<string, unknown> };
} = {}): PedidoUpdateDb {
  const calls = opts.calls ?? {};
  return {
    pedido: {
      async findFirst() { return opts.found === undefined ? pedidoRow() : opts.found; },
      async update(args) { calls.updateData = args.data; return { id: args.where.id, ...args.data, lines: [] }; },
    },
    customer: {
      async findFirst() { return opts.customerFound === undefined ? { id: 'cust-1' } : opts.customerFound; },
    },
  };
}

// ---------------------------------------------------------------------------
describe('buildPedidosOrderBy (whitelist + default)', () => {
  test('sin sort → createdAt desc por defecto', () => {
    assert.deepEqual(buildPedidosOrderBy({}), { createdAt: 'desc' });
  });
  test('columnas de la whitelist ordenan por su campo y dirección', () => {
    assert.deepEqual(buildPedidosOrderBy({ sort: 'numero', order: 'asc' }), { numero: 'asc' });
    assert.deepEqual(buildPedidosOrderBy({ sort: 'estado', order: 'desc' }), { estado: 'desc' });
    assert.deepEqual(buildPedidosOrderBy({ sort: 'createdAt' }), { createdAt: 'desc' });
  });
  test('campo fuera de la whitelist (p. ej. cliente) → default', () => {
    assert.deepEqual(buildPedidosOrderBy({ sort: 'cliente', order: 'asc' }), { createdAt: 'desc' });
    assert.deepEqual(buildPedidosOrderBy({ sort: 'totalImpl' }), { createdAt: 'desc' });
  });
});

// ---------------------------------------------------------------------------
describe('pedidoUpdateHandler (PATCH /pedidos/:id)', () => {
  test('body inválido → 422', async () => {
    const res = mockRes();
    await pedidoUpdateHandler(fakeDb(), mockReq({ body: { tasaIva: 5 } }), res); // tasaIva > 1
    assert.equal(res.statusCode, 422);
  });

  test('pedido inexistente / de otro negocio → 404', async () => {
    const res = mockRes();
    await pedidoUpdateHandler(fakeDb({ found: null }), mockReq({ body: { notas: 'x' } }), res);
    assert.equal(res.statusCode, 404);
  });

  test('presupuesto ya aceptado (con factura) → 409, no se edita', async () => {
    const res = mockRes();
    const calls = {} as { updateData?: Record<string, unknown> };
    const db = fakeDb({ found: pedidoRow({ estado: 'aceptada', invoice: { id: 'fac-1' } }), calls });
    await pedidoUpdateHandler(db, mockReq({ body: { notas: 'nuevo' } }), res);
    assert.equal(res.statusCode, 409);
    assert.equal((res.body as { error: { code: string } }).error.code, 'conflict');
    assert.equal(calls.updateData, undefined, 'no debe llegar a update()');
  });

  test('edita un presupuesto generada y RECALCULA totales server-side desde las líneas', async () => {
    const res = mockRes();
    const calls = {} as { updateData?: Record<string, unknown> };
    const db = fakeDb({ found: pedidoRow({ estado: 'generada' }), calls });
    await pedidoUpdateHandler(db, mockReq({
      body: {
        numero: 'P-2026-009',
        clienteSnapshot: { nombre: 'Cliente X', razonSocial: 'X SL' },
        // Totales basura del cliente: se ignoran y se recalculan desde las líneas.
        lines: [{ nombre: 'Impl', cantidad: 2, precioImpl: 100, precioMant: 10 }],
      },
    }), res);
    assert.equal(res.statusCode, 200);
    const data = calls.updateData!;
    assert.equal(data.numero, 'P-2026-009');
    assert.deepEqual(data.clienteSnapshot, { nombre: 'Cliente X', razonSocial: 'X SL' });
    assert.equal(data.subtotalImpl, 200);   // 2 * 100
    assert.equal(data.subtotalMant, 20);    // 2 * 10
    assert.equal(data.totalImpl, 242);      // 200 * 1.21
    assert.equal(data.totalMant, 24.2);     // 20 * 1.21
    // Reemplazo del conjunto de líneas (borra e inserta con posición).
    const linesOp = data.lines as { deleteMany: unknown; create: unknown[] };
    assert.ok(linesOp.deleteMany);
    assert.equal(linesOp.create.length, 1);
  });

  test('customerId de otro negocio → 422 (guard cross-tenant)', async () => {
    const res = mockRes();
    const db = fakeDb({ found: pedidoRow(), customerFound: null });
    await pedidoUpdateHandler(db, mockReq({ body: { customerId: 'ajeno' } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('sin líneas no toca totales (parche parcial: solo notas)', async () => {
    const res = mockRes();
    const calls = {} as { updateData?: Record<string, unknown> };
    await pedidoUpdateHandler(fakeDb({ calls }), mockReq({ body: { notas: 'solo notas' } }), res);
    assert.equal(res.statusCode, 200);
    const data = calls.updateData!;
    assert.equal(data.notas, 'solo notas');
    assert.equal(data.subtotalImpl, undefined, 'sin lines no se recalculan totales');
    assert.equal(data.lines, undefined);
  });
});
