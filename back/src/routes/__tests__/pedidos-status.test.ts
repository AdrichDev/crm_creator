// Unit tests del handler PUT /pedidos/:id/status (crm-paridad-facturas-pedidos-aa, PR-2b).
// Runner: node --import tsx --test. Mismo patrón DI que service-operator-write-ops.test.ts:
// BD inyectada como doble, sin servidor ni BD. Se ejercita la lógica de:
//   - guard de des-aceptación (400 si sale de `aceptada` con factura vinculada);
//   - transacción: el cambio de estado y la creación de factura ocurren DENTRO de la misma
//     $transaction (un fallo de factura no debe dejar el pedido `aceptada` sin factura);
//   - la factura sólo se crea al ENTRAR en `aceptada`.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../middleware/types.js';
import {
  pedidoStatusHandler,
  type PedidoStatusDb,
  type PedidoStatusTx,
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

type PedidoRow = {
  id: string; businessId: string; numero: string; clienteSnapshot: unknown;
  subtotalImpl: number; subtotalMant: number; totalImpl: number; totalMant: number;
  tasaIva: number; estado: string; invoice: { id: string } | null;
};

function pedidoRow(overrides: Partial<PedidoRow> = {}): PedidoRow {
  return {
    id: 'ped-1', businessId: ACTIVE, numero: 'AD-2026-001', clienteSnapshot: { nombre: 'Ana' },
    // Coherente con computePedidoTotals a IVA 21%: bases 100/10 → totales 121/12.1 (10.3).
    subtotalImpl: 100, subtotalMant: 10, totalImpl: 121, totalMant: 12.1,
    tasaIva: 0.21, estado: 'generada', invoice: null, ...overrides,
  };
}

// Doble de BD: findFirst devuelve el pedido (o null); $transaction ejecuta fn con una tx
// que registra las llamadas a pedido.update / invoice.create.
function fakeDb(opts: {
  found?: PedidoRow | null;
  onInvoiceCreate?: (data: Record<string, unknown>) => unknown; // lanza para simular P2002, etc.
  calls?: { updated?: Record<string, unknown>; invoiceData?: Record<string, unknown>; txUsed?: boolean };
} = {}): PedidoStatusDb {
  const calls = opts.calls ?? {};
  return {
    pedido: {
      findFirst: async () => (opts.found === undefined ? pedidoRow() : opts.found),
    },
    $transaction: async <T>(fn: (tx: PedidoStatusTx) => Promise<T>): Promise<T> => {
      calls.txUsed = true;
      const tx: PedidoStatusTx = {
        pedido: {
          update: async (args) => {
            calls.updated = args.data;
            // Devuelve un pedido con el nuevo estado + campos que necesita ensureInvoiceForPedido.
            return { ...pedidoRow(), estado: (args.data as { estado: string }).estado };
          },
        },
        invoice: {
          create: async (args: { data: Record<string, unknown> }) => {
            calls.invoiceData = args.data;
            if (opts.onInvoiceCreate) return opts.onInvoiceCreate(args.data);
            return { id: 'inv-new', ...args.data };
          },
        },
      };
      return fn(tx);
    },
  };
}

describe('PUT /pedidos/:id/status', () => {
  test('422 si el estado no es válido', async () => {
    const res = mockRes();
    await pedidoStatusHandler(fakeDb(), mockReq({ body: { estado: 'cobrada' } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('404 si el pedido no existe o es de otro negocio (findFirst → null)', async () => {
    const res = mockRes();
    await pedidoStatusHandler(fakeDb({ found: null }), mockReq({ body: { estado: 'aceptada' } }), res);
    assert.equal(res.statusCode, 404);
  });

  test('aceptar crea la factura DENTRO de la $transaction (update + invoice.create)', async () => {
    const calls: { updated?: Record<string, unknown>; invoiceData?: Record<string, unknown>; txUsed?: boolean } = {};
    const db = fakeDb({ found: pedidoRow({ estado: 'generada' }), calls });
    const res = mockRes();
    await pedidoStatusHandler(db, mockReq({ body: { estado: 'aceptada' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.txUsed, true, 'debe usar $transaction');
    assert.equal((calls.updated as { estado: string }).estado, 'aceptada');
    assert.ok(calls.invoiceData, 'debe crear la factura al aceptar');
    assert.equal(calls.invoiceData!.pedidoId, 'ped-1');
    assert.equal(calls.invoiceData!.numero, 'FAC - 2026-001');
    // Snapshot autocontenido 10.3: desglose copiado del pedido, total exacto al céntimo.
    assert.equal(calls.invoiceData!.subtotal, 110); // 100 + 10 (bases sin IVA)
    assert.equal(calls.invoiceData!.tasaIva, 0.21);
    assert.equal(calls.invoiceData!.total, 133.1); // 121 + 12.1 (con IVA)
  });

  test('transiciones que NO entran en aceptada no crean factura', async () => {
    const calls: { invoiceData?: Record<string, unknown> } = {};
    const db = fakeDb({ found: pedidoRow({ estado: 'generada' }), calls });
    const res = mockRes();
    await pedidoStatusHandler(db, mockReq({ body: { estado: 'rechazada' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.invoiceData, undefined, 'rechazar no debe crear factura');
  });

  test('GUARD des-aceptación: salir de aceptada con factura vinculada → 400', async () => {
    const calls: { txUsed?: boolean } = {};
    const db = fakeDb({ found: pedidoRow({ estado: 'aceptada', invoice: { id: 'inv-1' } }), calls });
    const res = mockRes();
    await pedidoStatusHandler(db, mockReq({ body: { estado: 'rechazada' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'conflict');
    assert.notEqual(calls.txUsed, true, 'no debe abrir transacción si el guard bloquea');
  });

  test('salir de aceptada SIN factura vinculada está permitido', async () => {
    const db = fakeDb({ found: pedidoRow({ estado: 'aceptada', invoice: null }) });
    const res = mockRes();
    await pedidoStatusHandler(db, mockReq({ body: { estado: 'caducada' } }), res);
    assert.equal(res.statusCode, 200);
  });

  test('re-aceptar un pedido ya aceptado con factura: P2002 en pedido_id se ignora (idempotente)', async () => {
    const db = fakeDb({
      found: pedidoRow({ estado: 'aceptada', invoice: { id: 'inv-1' } }),
      onInvoiceCreate: () => { throw { code: 'P2002', meta: { target: ['pedido_id'] } }; },
    });
    const res = mockRes();
    // aceptada → aceptada: el guard no aplica (no sale de aceptada), y el hook re-intenta
    // crear factura pero choca con pedido_id @unique → se ignora sin romper (200).
    await pedidoStatusHandler(db, mockReq({ body: { estado: 'aceptada' } }), res);
    assert.equal(res.statusCode, 200);
  });

  test('un P2002 de OTRA columna al aceptar NO se traga (propaga el fallo)', async () => {
    const db = fakeDb({
      found: pedidoRow({ estado: 'generada' }),
      onInvoiceCreate: () => { throw { code: 'P2002', meta: { target: ['numero'] } }; },
    });
    const res = mockRes();
    await assert.rejects(
      () => pedidoStatusHandler(db, mockReq({ body: { estado: 'aceptada' } }), res),
      (e: unknown) => (e as { code?: string }).code === 'P2002',
    );
  });
});
