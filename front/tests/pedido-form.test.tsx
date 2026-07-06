import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import type { Cliente, Pedido } from '@/lib/mock/data';
import { PedidoForm, type PedidoDraft, type Emisor } from '@/components/facturacion/pedido-form';

// crm-paridad-facturas-pedidos-aa (Fase 3, tasks 3.1/3.2): alta de pedido espejo del BudgetForm
// de AA. Totales SIEMPRE calculados (no confiados al input); en API el back los recalcula.

const EMISOR: Emisor = { empresa: 'Estudio 3A', cif: 'B987', direccion: 'Av. Sol 10', email: 'h@3a.com', telefono: '910' };
const CLIENTES: Cliente[] = [
  { id: 1, nombre: 'Ana Gómez', email: 'ana@mail.com', telefono: '600', visitas: 0, gastoTotal: 0, segmento: 'VIP', ultimaVisita: '', cif: 'B123' },
];

function baseDraft(): PedidoDraft {
  return {
    linkedClientId: '', clientName: '', clientRazonSocial: '', clientCif: '', clientAddress: '',
    clientEmail: '', clientPhone: '', clientContact: '', numero: 'P-2026-009',
    conceptos: [{ id: 's1', nombre: 'Servicio A', descripcion: 'Cat', precioImpl: 100, precioMant: 0, selected: false, cantidad: 1 }],
  };
}

const nombreInput = () => screen.getByText('Nombre *').parentElement!.querySelector('input')!;

afterEach(() => { cleanup(); });

describe('PedidoForm (tasks 3.1/3.2)', () => {
  it('renderiza la cabecera y el botón Generar deshabilitado sin datos', () => {
    render(<PedidoForm draft={baseDraft()} clientsList={CLIENTES} emisor={EMISOR} saving={false} onSaveEmisor={vi.fn()} onCancel={vi.fn()} onGenerate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeInTheDocument();
    expect((screen.getByText('Generar presupuesto').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('con nombre y un concepto seleccionado genera el pedido con totales calculados', () => {
    const onGenerate = vi.fn();
    render(<PedidoForm draft={baseDraft()} clientsList={CLIENTES} emisor={EMISOR} saving={false} onSaveEmisor={vi.fn()} onCancel={vi.fn()} onGenerate={onGenerate} />);

    fireEvent.change(nombreInput(), { target: { value: 'Cliente X' } });
    fireEvent.click(screen.getByText('Servicio A')); // selecciona el concepto

    const btn = screen.getByText('Generar presupuesto').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    expect(onGenerate).toHaveBeenCalledTimes(1);
    const pedido = onGenerate.mock.calls[0][0] as Omit<Pedido, 'id'>;
    expect(pedido.estado).toBe('generada');
    expect(pedido.numero).toBe('P-2026-009');
    expect(pedido.lines).toHaveLength(1);
    expect(pedido.subtotalImpl).toBe(100);
    expect(pedido.totalImpl).toBeCloseTo(121, 5); // 100 * 1.21
    expect(pedido.clienteSnapshot?.nombre).toBe('Cliente X');
  });

  it('en modo edición muestra el título y el botón de guardar cambios', () => {
    render(<PedidoForm draft={baseDraft()} clientsList={CLIENTES} emisor={EMISOR} saving={false} editing onSaveEmisor={vi.fn()} onCancel={vi.fn()} onGenerate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Editar presupuesto' })).toBeInTheDocument();
    expect(screen.getByText('Guardar cambios')).toBeInTheDocument();
  });

  it('Cancelar invoca onCancel', () => {
    const onCancel = vi.fn();
    render(<PedidoForm draft={baseDraft()} clientsList={CLIENTES} emisor={EMISOR} saving={false} onSaveEmisor={vi.fn()} onCancel={onCancel} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
