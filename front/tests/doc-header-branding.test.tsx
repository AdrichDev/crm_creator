import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { Pedido, Factura } from '@/lib/mock/data';

// Cabecera de los documentos imprimibles (presupuesto/factura): imagen por tenant con
// precedencia logoImage2 → logoImage → nada (nunca iniciales). El branding se lee del
// contexto del tenant vía useTenantBranding; aquí se mockea para controlar la precedencia.

let brandingValue: { logoImage?: string; logoImage2?: string } = {};
vi.mock('@/lib/tenant-config-context', () => ({
  useTenantBranding: () => brandingValue,
}));

// Import DESPUÉS del mock para que los componentes reciban el hook mockeado.
const { PedidoPreview } = await import('@/components/facturacion/pedido-preview');
const { FacturaPreview } = await import('@/components/facturacion/factura-preview');

const PEDIDO: Pedido = {
  id: 3101, numero: 'P-2026-001', estado: 'generada', createdAt: '2026-06-14T09:00:00.000Z',
  clienteSnapshot: { nombre: 'Ana Gómez' }, emisorSnapshot: { empresa: 'Estudio 3A' },
  tasaIva: 0.21, diasValidez: 30, notas: null,
  lines: [{ id: 1, nombre: 'Implantación CRM', cantidad: 1, precioImpl: 1200, precioMant: 0 }],
  subtotalImpl: 1200, subtotalMant: 0, totalImpl: 1452, totalMant: 0,
};

const FACTURA: Factura = {
  id: 3001, numero: 'FAC-2026-007', cliente: 'Ana Gómez', servicio: 'Consultoría',
  fecha: '2026-07-01', total: 340.5, estado: 'Pendiente', documentos: [],
};

beforeEach(() => { window.print = vi.fn(); brandingValue = {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PedidoPreview — cabecera de marca (logoImage2 → logoImage → nada)', () => {
  it('usa logoImage2 con precedencia sobre logoImage', () => {
    brandingValue = { logoImage: 'IMG_MARCA', logoImage2: 'IMG_CABECERA' };
    render(<PedidoPreview pedido={PEDIDO} onBack={vi.fn()} />);
    expect(screen.getByAltText('Marca').getAttribute('src')).toBe('IMG_CABECERA');
  });

  it('cae a logoImage cuando no hay logoImage2', () => {
    brandingValue = { logoImage: 'IMG_MARCA' };
    render(<PedidoPreview pedido={PEDIDO} onBack={vi.fn()} />);
    expect(screen.getByAltText('Marca').getAttribute('src')).toBe('IMG_MARCA');
  });

  it('sin ninguna imagen no renderiza cabecera (nunca iniciales)', () => {
    brandingValue = {};
    render(<PedidoPreview pedido={PEDIDO} onBack={vi.fn()} />);
    expect(screen.queryByAltText('Marca')).toBeNull();
  });
});

describe('FacturaPreview — cabecera de marca (logoImage2 → logoImage → nada)', () => {
  it('usa logoImage2 con precedencia sobre logoImage', () => {
    brandingValue = { logoImage: 'IMG_MARCA', logoImage2: 'IMG_CABECERA' };
    render(<FacturaPreview factura={FACTURA} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.getByAltText('Marca').getAttribute('src')).toBe('IMG_CABECERA');
  });

  it('cae a logoImage cuando no hay logoImage2', () => {
    brandingValue = { logoImage: 'IMG_MARCA' };
    render(<FacturaPreview factura={FACTURA} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.getByAltText('Marca').getAttribute('src')).toBe('IMG_MARCA');
  });

  it('sin ninguna imagen no renderiza cabecera (nunca iniciales)', () => {
    brandingValue = {};
    render(<FacturaPreview factura={FACTURA} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.queryByAltText('Marca')).toBeNull();
  });
});
