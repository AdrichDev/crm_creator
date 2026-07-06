import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, screen } from '@testing-library/react';
import type { Cliente } from '@/lib/mock/data';
import { PedidoForm, type PedidoDraft, type Emisor } from '@/components/facturacion/pedido-form';

// crm-presupuesto-catalogo-api: en modo API el catálogo de conceptos del formulario de
// presupuesto son los servicios REALES del negocio (GET /services), no la colección
// localStorage `servicios`. Sin esto los servicios sembrados no eran seleccionables.

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  isApiEnabled: () => true,
}));

const EMISOR: Emisor = { empresa: 'Estudio 3A', cif: 'B987', direccion: 'Av. Sol 10', email: 'h@3a.com', telefono: '910' };
const CLIENTES: Cliente[] = [
  { id: 1, nombre: 'Ana Gómez', email: 'ana@mail.com', telefono: '600', visitas: 0, gastoTotal: 0, segmento: 'VIP', ultimaVisita: '', cif: 'B123' },
];

// Draft con un concepto local (localStorage) que NO debe verse en modo API.
function apiDraft(): PedidoDraft {
  return {
    linkedClientId: '', clientName: '', clientRazonSocial: '', clientCif: '', clientAddress: '',
    clientEmail: '', clientPhone: '', clientContact: '', numero: 'P-2026-010',
    conceptos: [{ id: 'local1', nombre: 'Concepto Local', descripcion: '', precioImpl: 10, precioMant: 0, selected: false, cantidad: 1 }],
  };
}

afterEach(() => { cleanup(); apiFetchMock.mockReset(); });
async function flush() { await act(async () => { await Promise.resolve(); }); }

describe('PedidoForm — catálogo de conceptos desde /services (modo API)', () => {
  it('pide GET /services y muestra los servicios reales como conceptos', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/services')) return Promise.resolve({ items: [
        { id: 'srv1', nombre: 'Proyecto de interiorismo', descripcion: 'Integral', categoria: 'Interiorismo', precio: 1200 },
        { id: 'srv2', nombre: 'Diseño de paisajismo', precio: 800 },
      ] });
      return Promise.resolve({ items: [] });
    });

    render(<PedidoForm draft={apiDraft()} clientsList={CLIENTES} emisor={EMISOR} saving={false} onSaveEmisor={vi.fn()} onCancel={vi.fn()} onGenerate={vi.fn()} />);
    await flush();

    // Se pidió el catálogo real del negocio (con límite alto para no perder filas).
    expect(apiFetchMock).toHaveBeenCalledWith('/services?limit=100');

    // Los servicios sembrados son seleccionables; el concepto localStorage ya no aparece.
    expect(screen.getByText('Proyecto de interiorismo')).toBeInTheDocument();
    expect(screen.getByText('Diseño de paisajismo')).toBeInTheDocument();
    expect(screen.queryByText('Concepto Local')).toBeNull();
  });

  it('en edición preserva las líneas ya seleccionadas del draft', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/services')) return Promise.resolve({ items: [
        { id: 'srv1', nombre: 'Proyecto de interiorismo', precio: 1200 },
      ] });
      return Promise.resolve({ items: [] });
    });

    const draft = apiDraft();
    draft.conceptos = [{ id: 'srv1', nombre: 'Proyecto de interiorismo', descripcion: '', precioImpl: 1200, precioMant: 0, selected: true, cantidad: 2 }];

    render(<PedidoForm draft={draft} clientsList={CLIENTES} emisor={EMISOR} saving={false} editing onSaveEmisor={vi.fn()} onCancel={vi.fn()} onGenerate={vi.fn()} />);
    await flush();

    // La línea preseleccionada del draft conserva su cantidad (input numérico visible).
    const qty = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(qty).toBeTruthy();
    expect(qty.value).toBe('2');
  });
});
