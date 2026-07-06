import { describe, it, expect } from 'vitest';
import { pedidoMatches, facturaMatches } from '@/lib/facturacion/list-filter';
import type { Factura, Pedido } from '@/lib/mock/data';

// crm 5d: helpers puros del buscador de Presupuestos/Facturas. Buscan por número, cliente
// (nombre/razón social) y persona de contacto, case-insensitive y por subcadena.

const pedido = (over: Partial<Pedido>): Pedido => ({
  id: 1, numero: 'PRES-2026-001', estado: 'generada',
  clienteSnapshot: { nombre: 'Ana Gómez', razonSocial: 'Reformas Gómez SL', contacto: 'Marta Ruiz' },
  emisorSnapshot: {}, subtotalImpl: 0, subtotalMant: 0, totalImpl: 0, totalMant: 0,
  tasaIva: 0.21, lines: [], createdAt: '2026-07-01T00:00:00.000Z', ...over,
});

const factura = (over: Partial<Factura> & { clienteSnapshot?: Record<string, string> }): Factura =>
  ({ id: 1, numero: 'F-2026-001', cliente: 'Ana Gómez', fecha: '2026-07-01', total: 10, estado: 'Pendiente', ...over } as Factura);

describe('pedidoMatches', () => {
  it('query vacía → siempre casa', () => {
    expect(pedidoMatches(pedido({}), '')).toBe(true);
    expect(pedidoMatches(pedido({}), '   ')).toBe(true);
  });
  it('casa por número (case-insensitive, subcadena)', () => {
    expect(pedidoMatches(pedido({}), 'pres-2026-001')).toBe(true);
    expect(pedidoMatches(pedido({}), '001')).toBe(true);
  });
  it('casa por nombre y razón social del cliente', () => {
    expect(pedidoMatches(pedido({}), 'ana')).toBe(true);
    expect(pedidoMatches(pedido({}), 'reformas gómez')).toBe(true);
  });
  it('casa por persona de contacto', () => {
    expect(pedidoMatches(pedido({}), 'marta')).toBe(true);
  });
  it('no casa cuando nada coincide', () => {
    expect(pedidoMatches(pedido({}), 'zzz')).toBe(false);
  });
});

describe('facturaMatches', () => {
  it('query vacía → siempre casa', () => {
    expect(facturaMatches(factura({}), '')).toBe(true);
  });
  it('casa por número y por cliente', () => {
    expect(facturaMatches(factura({}), 'f-2026')).toBe(true);
    expect(facturaMatches(factura({}), 'gómez')).toBe(true);
  });
  it('casa por persona de contacto si viaja en el snapshot', () => {
    expect(facturaMatches(factura({ clienteSnapshot: { contacto: 'Pedro Sanz' } }), 'pedro')).toBe(true);
  });
  it('no casa cuando nada coincide', () => {
    expect(facturaMatches(factura({}), 'zzz')).toBe(false);
  });
});
