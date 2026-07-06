// Unit tests de buildInvoicesOrderBy (ordenación por cabecera) y de invoiceStatusHandler
// (PUT /invoices/:id/status, crm-operaos 10.3). Runner: node --import tsx --test. Mismo
// patrón DI que pedidos-update.test.ts: BD inyectada como doble, sin servidor ni BD.
//
// Puntos fijados:
//   - set CERRADO de estados (Pendiente|Pagada|Anulada): cualquier otro literal → 422 sin
//     tocar la fila;
//   - a 'Pagada' → pagadaEn = now(); a cualquier otro estado → pagadaEn = null (espejo de
//     AA: status === 'cobrada' ? new Date() : null);
//   - scoping por negocio + soft-delete (404 si findFirst no encuentra).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthedRequest } from '../../middleware/types.js';
import { buildInvoicesOrderBy, invoiceStatusHandler, type InvoiceStatusDb } from '../invoices.js';

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
    params: opts.params ?? { id: 'inv-1' },
    body: opts.body,
    businessId: opts.businessId ?? 'biz-1',
  } as unknown as AuthedRequest;
}

// Doble de BD: findFirst devuelve la fila (o null); update registra la `data` recibida.
function fakeDb(opts: {
  found?: { id: string; estado: string } | null;
  calls?: { updateData?: Record<string, unknown>; updates?: number };
} = {}): InvoiceStatusDb {
  const calls = opts.calls ?? {};
  return {
    invoice: {
      async findFirst() { return opts.found === undefined ? { id: 'inv-1', estado: 'Pendiente' } : opts.found; },
      async update(args) {
        calls.updateData = args.data;
        calls.updates = (calls.updates ?? 0) + 1;
        return { id: args.where.id, ...args.data, lines: [] };
      },
    },
  };
}

// ---------------------------------------------------------------------------
describe('buildInvoicesOrderBy (whitelist + default)', () => {
  test('sin sort → createdAt desc por defecto', () => {
    assert.deepEqual(buildInvoicesOrderBy({}), { createdAt: 'desc' });
  });
  test('columnas de la whitelist (numero/cliente/fecha/estado) ordenan por su campo y dirección', () => {
    assert.deepEqual(buildInvoicesOrderBy({ sort: 'numero', order: 'asc' }), { numero: 'asc' });
    assert.deepEqual(buildInvoicesOrderBy({ sort: 'cliente', order: 'desc' }), { cliente: 'desc' });
    assert.deepEqual(buildInvoicesOrderBy({ sort: 'fecha', order: 'asc' }), { fecha: 'asc' });
    assert.deepEqual(buildInvoicesOrderBy({ sort: 'estado' }), { estado: 'desc' }); // order inválido → desc
  });
  test('campo fuera de la whitelist → default (no se ordena por columnas arbitrarias)', () => {
    assert.deepEqual(buildInvoicesOrderBy({ sort: 'total', order: 'asc' }), { createdAt: 'desc' });
    assert.deepEqual(buildInvoicesOrderBy({ sort: 'pagadaEn' }), { createdAt: 'desc' });
  });
});

// ---------------------------------------------------------------------------
describe('invoiceStatusHandler (PUT /invoices/:id/status)', () => {
  test('a "Pagada" → estado actualizado y pagadaEn = now()', async () => {
    const calls: { updateData?: Record<string, unknown> } = {};
    const res = mockRes();
    const before = Date.now();
    await invoiceStatusHandler(fakeDb({ calls }), mockReq({ body: { estado: 'Pagada' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.updateData!.estado, 'Pagada');
    const pagadaEn = calls.updateData!.pagadaEn as Date;
    assert.ok(pagadaEn instanceof Date, 'pagadaEn debe ser un Date');
    assert.ok(pagadaEn.getTime() >= before && pagadaEn.getTime() <= Date.now());
  });

  test('salir de "Pagada" (→ Pendiente) LIMPIA pagadaEn (null)', async () => {
    const calls: { updateData?: Record<string, unknown> } = {};
    const res = mockRes();
    await invoiceStatusHandler(
      fakeDb({ found: { id: 'inv-1', estado: 'Pagada' }, calls }),
      mockReq({ body: { estado: 'Pendiente' } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(calls.updateData!.estado, 'Pendiente');
    assert.equal(calls.updateData!.pagadaEn, null);
  });

  test('a "Anulada" también limpia pagadaEn (solo Pagada lo mantiene)', async () => {
    const calls: { updateData?: Record<string, unknown> } = {};
    const res = mockRes();
    await invoiceStatusHandler(fakeDb({ calls }), mockReq({ body: { estado: 'Anulada' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.updateData!.pagadaEn, null);
  });

  test('SET CERRADO: estado fuera de Pendiente|Pagada|Anulada → 422 y NO toca la fila', async () => {
    for (const estado of ['Cobrada', 'pagada', 'aceptada', '', 42, null]) {
      const calls: { updates?: number } = {};
      const res = mockRes();
      await invoiceStatusHandler(fakeDb({ calls }), mockReq({ body: { estado } }), res);
      assert.equal(res.statusCode, 422, `estado ${JSON.stringify(estado)} debe rechazarse`);
      assert.equal(calls.updates ?? 0, 0, 'no debe llamar a update');
    }
  });

  test('body sin estado → 422', async () => {
    const res = mockRes();
    await invoiceStatusHandler(fakeDb(), mockReq({ body: {} }), res);
    assert.equal(res.statusCode, 422);
  });

  test('factura inexistente / de otro negocio / soft-borrada → 404 (scoping vía findFirst)', async () => {
    const res = mockRes();
    await invoiceStatusHandler(fakeDb({ found: null }), mockReq({ body: { estado: 'Pagada' } }), res);
    assert.equal(res.statusCode, 404);
  });
});
