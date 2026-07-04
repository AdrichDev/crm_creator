// Unit tests puros de la auto-factura al aceptar (crm-paridad-facturas-pedidos-aa, PR-2b).
// Runner: node --import tsx --test. Sin BD: función pura + un doble mínimo de tx.
//
// Punto CRÍTICO fijado aquí: el discriminador del P2002 (isPedidoUniqueConflict) sólo trata
// como "ya facturado" la colisión de pedido_id; un P2002 de OTRA columna (p. ej. numero) se
// RELANZA. Es exactamente el bug que una revisión de Devil's Advocate detectó en AA (catch
// ciego que se tragaba una colisión distinta como si fuera la de idempotencia).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveInvoiceNumberFromPedido,
  isPedidoUniqueConflict,
  ensureInvoiceForPedido,
  type InvoiceCreateTx,
  type PedidoForInvoice,
} from '../invoice.js';

// Error P2002 con la forma "clásica" del query-engine (code + meta.target con columna(s)).
function p2002(target: string | string[]): { code: string; meta: { target: string | string[] } } {
  return { code: 'P2002', meta: { target } };
}

// Error P2002 con la forma REAL observada en runtime contra Postgres con Prisma 7.x +
// @prisma/adapter-pg: NO trae `meta.target` (queda undefined); la columna en conflicto vive
// en `meta.driverAdapterError.cause.constraint.fields`. Reproducido en vivo: sin este camino,
// `isPedidoUniqueConflict` devolvía false para un P2002 legítimo de pedido_id, el catch
// relanzaba, y el throw no capturado tumbaba el proceso Node entero (no un 500 controlado).
function p2002DriverAdapter(fields: string[]) {
  return {
    code: 'P2002',
    meta: {
      modelName: 'Invoice',
      driverAdapterError: { cause: { constraint: { fields } } },
    },
  };
}

// Doble de tx: captura el `data` del invoice.create, o lanza el error configurado.
function fakeTx(opts: { throwOnCreate?: unknown } = {}): InvoiceCreateTx & { created?: Record<string, unknown> } {
  const tx: InvoiceCreateTx & { created?: Record<string, unknown> } = {
    invoice: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (opts.throwOnCreate) throw opts.throwOnCreate;
        tx.created = args.data;
        return { id: 'inv-new', ...args.data };
      },
    },
  };
  return tx;
}

const basePedido: PedidoForInvoice = {
  id: 'ped-1',
  businessId: 'biz-1',
  numero: 'AD-2026-001',
  clienteSnapshot: { nombre: 'Ana Pérez' },
  totalImpl: 302.5,
  totalMant: 30.25,
};

// ── deriveInvoiceNumberFromPedido ─────────────────────────────────────────────
describe('deriveInvoiceNumberFromPedido', () => {
  test('cambia el prefijo alfabético por "FAC - " (igual idea que AA)', () => {
    assert.equal(deriveInvoiceNumberFromPedido('AD-2026-001'), 'FAC - 2026-001');
  });
  test('funciona con cualquier prefijo alfabético, no sólo "AD-"', () => {
    assert.equal(deriveInvoiceNumberFromPedido('P-17'), 'FAC - 17');
    assert.equal(deriveInvoiceNumberFromPedido('PRES-99'), 'FAC - 99');
  });
  test('sin prefijo alfabético → antepone "FAC - " tal cual', () => {
    assert.equal(deriveInvoiceNumberFromPedido('2026-007'), 'FAC - 2026-007');
  });
  test('es estable/idempotente: mismo numero de pedido → mismo numero de factura', () => {
    assert.equal(deriveInvoiceNumberFromPedido('AD-2026-001'), deriveInvoiceNumberFromPedido('AD-2026-001'));
  });
});

// ── isPedidoUniqueConflict (el discriminador crítico) ─────────────────────────
describe('isPedidoUniqueConflict', () => {
  test('true si el target es pedido_id / pedidoId / nombre del índice', () => {
    assert.equal(isPedidoUniqueConflict(p2002('pedido_id')), true);
    assert.equal(isPedidoUniqueConflict(p2002('pedidoId')), true);
    assert.equal(isPedidoUniqueConflict(p2002(['pedido_id'])), true);
    assert.equal(isPedidoUniqueConflict(p2002('factura_pedido_id_key')), true);
  });
  test('false si el target es OTRA columna (p. ej. numero) — NO es el caso de idempotencia', () => {
    assert.equal(isPedidoUniqueConflict(p2002('numero')), false);
    assert.equal(isPedidoUniqueConflict(p2002(['numero'])), false);
  });
  test('false si no hay meta.target', () => {
    assert.equal(isPedidoUniqueConflict({ code: 'P2002' }), false);
    assert.equal(isPedidoUniqueConflict(undefined), false);
    assert.equal(isPedidoUniqueConflict(null), false);
  });

  // Forma real del client-engine con @prisma/adapter-pg (Prisma 7.x): sin esto, un P2002
  // legítimo de pedido_id se relanzaba y tumbaba el proceso (reproducido en runtime real).
  test('true con la forma driverAdapterError.cause.constraint.fields (Prisma 7.x + adapter-pg)', () => {
    assert.equal(isPedidoUniqueConflict(p2002DriverAdapter(['pedido_id'])), true);
  });
  test('false con driverAdapterError si el field en conflicto es OTRA columna', () => {
    assert.equal(isPedidoUniqueConflict(p2002DriverAdapter(['numero'])), false);
  });
});

// ── ensureInvoiceForPedido ────────────────────────────────────────────────────
describe('ensureInvoiceForPedido', () => {
  test('crea la factura con datos derivados del pedido (numero/cliente/total/estado/pedidoId)', async () => {
    const tx = fakeTx();
    await ensureInvoiceForPedido(tx, basePedido);
    assert.ok(tx.created);
    assert.equal(tx.created!.numero, 'FAC - 2026-001');
    assert.equal(tx.created!.cliente, 'Ana Pérez');
    assert.equal(tx.created!.total, 332.75); // 302.5 + 30.25
    assert.equal(tx.created!.estado, 'Pendiente');
    assert.equal(tx.created!.pedidoId, 'ped-1');
    assert.equal(tx.created!.businessId, 'biz-1');
    assert.equal(tx.created!.servicio, null);
  });

  test('cliente vacío si el snapshot no trae nombre (columna NOT NULL admite "")', async () => {
    const tx = fakeTx();
    await ensureInvoiceForPedido(tx, { ...basePedido, clienteSnapshot: {} });
    assert.equal(tx.created!.cliente, '');
  });

  test('IDEMPOTENTE: P2002 en pedido_id se ignora (no relanza, no crea 2ª factura)', async () => {
    const tx = fakeTx({ throwOnCreate: p2002('pedido_id') });
    await assert.doesNotReject(() => ensureInvoiceForPedido(tx, basePedido));
  });

  test('NO CIEGO: P2002 en OTRA columna (numero) se RELANZA (no se traga en silencio)', async () => {
    const tx = fakeTx({ throwOnCreate: p2002('numero') });
    await assert.rejects(() => ensureInvoiceForPedido(tx, basePedido), (e: unknown) => (e as { code?: string }).code === 'P2002');
  });

  test('un error que NO es P2002 se relanza siempre', async () => {
    const boom = Object.assign(new Error('db down'), { code: 'P1001' });
    const tx = fakeTx({ throwOnCreate: boom });
    await assert.rejects(() => ensureInvoiceForPedido(tx, basePedido), /db down/);
  });
});
