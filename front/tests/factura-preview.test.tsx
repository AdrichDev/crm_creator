import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import type { Factura } from '@/lib/mock/data';
import { FacturaPreview } from '@/components/facturacion/factura-preview';

// crm-paridad-facturas-pedidos-aa (Fase 2, task 2.3) + detalle documental (crm-operaos 10.3):
// documento imprimible de factura. Con `lines` renderiza la tabla de conceptos + desglose
// Base imponible / IVA / Total (espejo de AA); sin `lines` (mock antiguo / legacy sin
// backfill) degrada al bloque simple cliente/servicio + total.

const BASE: Factura = {
  id: 3001, numero: 'FAC - 2026-007', cliente: 'Ana Gómez', servicio: 'Consultoría',
  fecha: '2026-07-01', total: 340.5, estado: 'Pendiente', documentos: [],
};

// Factura DETALLADA como la crea ensureInvoiceForPedido (10.3): líneas partidas
// (pago único)/(mensual), subtotal sin IVA, tasaIva 0.21, total con IVA exacto.
const DETALLADA: Factura = {
  id: 3002, numero: 'FAC - 2026-008', cliente: 'Ana Gómez', fecha: '2026-07-06',
  subtotal: 275, tasaIva: 0.21, total: 332.75, estado: 'Pendiente', documentos: [],
  lines: [
    { id: 'l1', nombre: 'Implantación CRM (pago único)', descripcion: 'Setup inicial', cantidad: 1, precioUnit: 250, importe: 250 },
    { id: 'l2', nombre: 'Implantación CRM (mensual)', cantidad: 1, precioUnit: 25, importe: 25 },
  ],
};

// Factura LEGACY tal como la deja la migración 10.3: 1 línea (servicio, importe = total),
// tasaIva 0 y subtotal = total — el desglose muestra IVA €0.00, sin inventar un 21%.
const LEGACY_MIGRADA: Factura = {
  id: 3003, numero: 'FAC-2026-0002', cliente: 'Bea López', servicio: 'Servicio comercial mensual',
  fecha: '2026-05-01', subtotal: 620.5, tasaIva: 0, total: 620.5, estado: 'Pendiente', documentos: [],
  lines: [{ id: 'l1', nombre: 'Servicio comercial mensual', cantidad: 1, precioUnit: 620.5, importe: 620.5 }],
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

describe('FacturaPreview — detalle documental (crm-operaos 10.3)', () => {
  it('con líneas renderiza la tabla de conceptos y el desglose Base imponible / IVA / Total', () => {
    render(<FacturaPreview factura={DETALLADA} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    // Tabla de líneas (partición pago único / mensual del snapshot).
    expect(screen.getByText('Implantación CRM (pago único)')).toBeInTheDocument();
    expect(screen.getByText('Implantación CRM (mensual)')).toBeInTheDocument();
    expect(screen.getByText('Setup inicial')).toBeInTheDocument();
    // €250.00 aparece como precio unitario e importe (cantidad 1) de la primera línea.
    expect(screen.getAllByText('€250.00')).toHaveLength(2);
    // Desglose: subtotal + IVA (por diferencia: 332.75 - 275 = 57.75) + total, que CUADRAN.
    expect(screen.getByText('Base imponible:')).toBeInTheDocument();
    expect(screen.getByText('€275.00')).toBeInTheDocument();
    expect(screen.getByText('IVA (21%):')).toBeInTheDocument();
    expect(screen.getByText('€57.75')).toBeInTheDocument();
    expect(screen.getByText('€332.75')).toBeInTheDocument();
  });

  it('factura legacy migrada (1 línea, tasaIva 0) muestra IVA (0%) €0.00 y total EXACTO', () => {
    render(<FacturaPreview factura={LEGACY_MIGRADA} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.getByText('Servicio comercial mensual')).toBeInTheDocument(); // línea del backfill
    expect(screen.getByText('IVA (0%):')).toBeInTheDocument();
    expect(screen.getByText('€0.00')).toBeInTheDocument();
    // subtotal = total (aparece 3 veces: precio unit., importe de línea, base y total → 4).
    expect(screen.getAllByText('€620.50').length).toBeGreaterThanOrEqual(3);
  });

  it('sin líneas degrada al bloque simple (sin tabla ni desglose de IVA)', () => {
    render(<FacturaPreview factura={BASE} vistaCliente={false} onBack={vi.fn()} docs={[]} canUpload onAddDoc={vi.fn()} />);
    expect(screen.queryByText('Base imponible:')).toBeNull();
    expect(screen.queryByText(/^IVA \(/)).toBeNull();
    expect(screen.getByText('€340.50')).toBeInTheDocument(); // total simple
  });
});
