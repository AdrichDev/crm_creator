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
  buildInvoiceLinesFromPedido,
  type InvoiceCreateTx,
  type PedidoForInvoice,
  type PedidoLineForInvoice,
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

// Pedido base coherente con computePedidoTotals: 1 línea 250 impl + 25 mant, IVA 21%
// → subtotales 250/25, totales 302.5/30.25.
const basePedido: PedidoForInvoice = {
  id: 'ped-1',
  businessId: 'biz-1',
  numero: 'AD-2026-001',
  clienteSnapshot: { nombre: 'Ana Pérez' },
  subtotalImpl: 250,
  subtotalMant: 25,
  totalImpl: 302.5,
  totalMant: 30.25,
  tasaIva: 0.21,
  lines: [
    { nombre: 'Implantación CRM', descripcion: 'Setup inicial', cantidad: 1, precioImpl: 250, precioMant: 25, posicion: 0 },
  ],
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

// ── buildInvoiceLinesFromPedido (snapshot documental, crm-operaos 10.3) ───────
describe('buildInvoiceLinesFromPedido', () => {
  test('línea con SOLO pago único → una línea de factura sin sufijo', () => {
    const out = buildInvoiceLinesFromPedido([
      { nombre: 'Setup', descripcion: null, cantidad: 2, precioImpl: 100, precioMant: 0, posicion: 0 },
    ]);
    assert.deepEqual(out, [
      { nombre: 'Setup', descripcion: null, cantidad: 2, precioUnit: 100, importe: 200, posicion: 0 },
    ]);
  });

  test('línea con impl Y mant → se PARTE en "(pago único)" + "(mensual)" y la suma es exacta', () => {
    const out = buildInvoiceLinesFromPedido([
      { nombre: 'CRM', descripcion: 'desc', cantidad: 1, precioImpl: 250, precioMant: 25, posicion: 0 },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].nombre, 'CRM (pago único)');
    assert.equal(out[0].importe, 250);
    assert.equal(out[1].nombre, 'CRM (mensual)');
    assert.equal(out[1].importe, 25);
    assert.deepEqual(out.map((l) => l.posicion), [0, 1]);
    // Suma de importes = subtotalImpl + subtotalMant del pedido, al céntimo.
    assert.equal(out.reduce((s, l) => s + l.importe, 0), 275);
  });

  test('línea solo-mensual conserva el sufijo "(mensual)"', () => {
    const out = buildInvoiceLinesFromPedido([
      { nombre: 'Mantenimiento', descripcion: null, cantidad: 1, precioImpl: 0, precioMant: 30, posicion: 0 },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].nombre, 'Mantenimiento (mensual)');
    assert.equal(out[0].precioUnit, 30);
  });

  test('línea sin precios (0/0) se conserva como línea de importe 0', () => {
    const out = buildInvoiceLinesFromPedido([
      { nombre: 'Bonus', descripcion: null, cantidad: 1, precioImpl: 0, precioMant: 0, posicion: 0 },
    ]);
    assert.deepEqual(out, [
      { nombre: 'Bonus', descripcion: null, cantidad: 1, precioUnit: 0, importe: 0, posicion: 0 },
    ]);
  });

  test('respeta la posicion del pedido y renumera secuencialmente', () => {
    const lines: PedidoLineForInvoice[] = [
      { nombre: 'B', descripcion: null, cantidad: 1, precioImpl: 10, precioMant: 0, posicion: 1 },
      { nombre: 'A', descripcion: null, cantidad: 1, precioImpl: 20, precioMant: 5, posicion: 0 },
    ];
    const out = buildInvoiceLinesFromPedido(lines);
    assert.deepEqual(out.map((l) => l.nombre), ['A (pago único)', 'A (mensual)', 'B']);
    assert.deepEqual(out.map((l) => l.posicion), [0, 1, 2]);
  });

  test('sin líneas (undefined o vacío) → snapshot vacío, sin lanzar', () => {
    assert.deepEqual(buildInvoiceLinesFromPedido(undefined), []);
    assert.deepEqual(buildInvoiceLinesFromPedido([]), []);
  });

  test('redondeo por línea: cantidad*precio con arrastre IEEE-754 queda a 2 decimales', () => {
    const out = buildInvoiceLinesFromPedido([
      { nombre: 'X', descripcion: null, cantidad: 3, precioImpl: 0.1, precioMant: 0, posicion: 0 },
    ]);
    assert.equal(out[0].importe, 0.3); // no 0.30000000000000004
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
    assert.equal(tx.created!.total, 332.75); // 302.5 + 30.25 — EXACTO, invariante 10.3
    assert.equal(tx.created!.estado, 'Pendiente');
    assert.equal(tx.created!.pedidoId, 'ped-1');
    assert.equal(tx.created!.businessId, 'biz-1');
    assert.equal(tx.created!.servicio, null);
  });

  test('SNAPSHOT autocontenido (10.3): subtotal/tasaIva copiados del pedido + líneas anidadas', async () => {
    const tx = fakeTx();
    await ensureInvoiceForPedido(tx, basePedido);
    assert.equal(tx.created!.subtotal, 275); // 250 + 25 (base sin IVA, copiada del pedido)
    assert.equal(tx.created!.tasaIva, 0.21);
    const lines = (tx.created!.lines as { create: Array<{ nombre: string; importe: number }> }).create;
    assert.equal(lines.length, 2); // la línea impl+mant se parte en dos
    assert.deepEqual(lines.map((l) => l.nombre), ['Implantación CRM (pago único)', 'Implantación CRM (mensual)']);
    // Coherencia contable del documento: Σ importes = subtotal; subtotal*(1+IVA) = total.
    assert.equal(lines.reduce((s, l) => s + l.importe, 0), 275);
    assert.equal(Math.round(275 * 1.21 * 100) / 100, 332.75);
  });

  test('pedido sin líneas → factura con snapshot vacío y totales intactos', async () => {
    const tx = fakeTx();
    await ensureInvoiceForPedido(tx, { ...basePedido, lines: [] });
    assert.deepEqual((tx.created!.lines as { create: unknown[] }).create, []);
    assert.equal(tx.created!.total, 332.75);
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
