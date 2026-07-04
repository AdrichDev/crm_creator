import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import type { Factura } from '@/lib/mock/data';
import { FacturaPreview } from '@/components/facturacion/factura-preview';

// crm-paridad-facturas-pedidos-aa (Fase 2, task 2.3): documento imprimible de factura.
// Modelo plano (sin líneas ni IVA, por decisión de diseño): número, cliente/servicio, total,
// estado, y referencia al pedido origen SOLO si existe (pedidoId puede ser null).

const BASE: Factura = {
  id: 3001, numero: 'FAC - 2026-007', cliente: 'Ana Gómez', servicio: 'Consultoría',
  fecha: '2026-07-01', total: 340.5, estado: 'Pendiente', documentos: [],
};

beforeEach(() => { window.print = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FacturaPreview (task 2.3)', () => {
  it('renderiza número, total, estado y cliente/servicio', () => {
    render(<FacturaPreview factura={BASE} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Factura' })).toBeInTheDocument();
    expect(screen.getByText('FAC - 2026-007')).toBeInTheDocument();
    expect(screen.getByText('€340.50')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('Consultoría')).toBeInTheDocument();
  });

  it('el botón Imprimir invoca window.print', () => {
    render(<FacturaPreview factura={BASE} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    fireEvent.click(screen.getByText('Imprimir'));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('Volver invoca onBack', () => {
    const onBack = vi.fn();
    render(<FacturaPreview factura={BASE} vistaCliente={false} onBack={onBack} docs={[]} canUpload onAddDoc={vi.fn()} />);
    fireEvent.click(screen.getByText('Volver'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('sin pedidoId NO muestra la nota de origen', () => {
    render(<FacturaPreview factura={BASE} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.queryByText(/Generada automáticamente al aceptar un pedido/i)).toBeNull();
  });

  it('con pedidoId muestra la nota de origen', () => {
    render(<FacturaPreview factura={{ ...BASE, pedidoId: 'ped_9' }} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.getByText(/Generada automáticamente al aceptar un pedido/i)).toBeInTheDocument();
  });

  it('vista cliente oculta el nombre del cliente', () => {
    render(<FacturaPreview factura={BASE} vistaCliente onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.queryByText('Ana Gómez')).toBeNull();
    expect(screen.getByText('Consultoría')).toBeInTheDocument();
  });
});
