import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import type { Pedido } from '@/lib/mock/data';
import { PedidoPreview, pedidoTone } from '@/components/facturacion/pedido-preview';

// crm-paridad-facturas-pedidos-aa (Fase 3, task 3.1): documento imprimible de pedido/presupuesto,
// espejo del BudgetPreview de AA (cabecera, emisor/cliente, tabla de conceptos, totales con IVA).

const BASE: Pedido = {
  id: 3101, numero: 'P-2026-001', estado: 'generada', createdAt: '2026-06-14T09:00:00.000Z',
  clienteSnapshot: { nombre: 'Ana Gómez', cif: 'B123', direccion: 'C/ Mayor 3', email: 'ana@mail.com', telefono: '600', contacto: 'Ana Gómez' },
  emisorSnapshot: { empresa: 'Estudio 3A', cif: 'B987', direccion: 'Av. Sol 10', email: 'hola@3a.com', telefono: '910' },
  tasaIva: 0.21, diasValidez: 30, notas: null,
  lines: [{ id: 1, nombre: 'Implantación CRM', descripcion: 'Puesta en marcha', cantidad: 1, precioImpl: 1200, precioMant: 0 }],
  subtotalImpl: 1200, subtotalMant: 0, totalImpl: 1452, totalMant: 0,
};

beforeEach(() => { window.print = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PedidoPreview (task 3.1)', () => {
  it('renderiza cabecera, número, cliente, concepto y total', () => {
    render(<PedidoPreview pedido={BASE} onBack={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Presupuesto' })).toBeInTheDocument();
    expect(screen.getByText('P-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('Implantación CRM')).toBeInTheDocument();
    expect(screen.getByText('1452.00 €')).toBeInTheDocument();  // total pago único (con IVA)
  });

  it('el botón Imprimir invoca window.print', () => {
    render(<PedidoPreview pedido={BASE} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Imprimir'));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('Volver invoca onBack', () => {
    const onBack = vi.fn();
    render(<PedidoPreview pedido={BASE} onBack={onBack} />);
    fireEvent.click(screen.getByText('Volver'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('un pedido generada NO muestra la nota de factura', () => {
    render(<PedidoPreview pedido={BASE} onBack={vi.fn()} />);
    expect(screen.queryByText(/se generó automáticamente su factura/i)).toBeNull();
  });

  it('un pedido aceptada muestra que ya generó su factura (PR-2b)', () => {
    render(<PedidoPreview pedido={{ ...BASE, estado: 'aceptada' }} onBack={vi.fn()} />);
    expect(screen.getByText(/se generó automáticamente su factura/i)).toBeInTheDocument();
  });

  it('pedidoTone mapea el ciclo de estados de AA', () => {
    expect(pedidoTone('generada')).toBe('amber');
    expect(pedidoTone('aceptada')).toBe('green');
    expect(pedidoTone('rechazada')).toBe('red');
    expect(pedidoTone('caducada')).toBe('gray');
  });
});
