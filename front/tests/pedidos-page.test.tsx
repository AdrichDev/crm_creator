import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Pedido } from '@/lib/mock/data';
import Page from '@/app/(crm)/pedidos/page';

// crm-paridad-facturas-pedidos-aa (Fase 3, tasks 3.1/3.2/3.3): pantalla Pedidos documental,
// superficie separada del TPV (ventas). Listado + métricas + alta + preview + ciclo de estados.

const PEDIDOS: Pedido[] = [
  {
    id: 3101, numero: 'P-2026-001', estado: 'generada', createdAt: '2026-06-14T09:00:00.000Z',
    clienteSnapshot: { nombre: 'Ana Gómez' }, emisorSnapshot: {},
    tasaIva: 0.21, diasValidez: 30, notas: null,
    lines: [{ id: 1, nombre: 'Implantación', cantidad: 1, precioImpl: 1200, precioMant: 0 }],
    subtotalImpl: 1200, subtotalMant: 0, totalImpl: 1452, totalMant: 0,
  },
  {
    id: 3102, numero: 'P-2026-002', estado: 'aceptada', createdAt: '2026-06-12T11:30:00.000Z',
    clienteSnapshot: { nombre: 'Lucía Fernández' }, emisorSnapshot: {},
    tasaIva: 0.21, diasValidez: 30, notas: null,
    lines: [{ id: 1, nombre: 'Web', cantidad: 1, precioImpl: 850, precioMant: 0 }],
    subtotalImpl: 850, subtotalMant: 0, totalImpl: 1028.5, totalMant: 0,
  },
];

const updateMock = vi.fn();
const createMock = vi.fn();
const alertMock = vi.fn().mockResolvedValue(undefined);
const confirmMock = vi.fn(async () => true);
vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: alertMock, confirm: confirmMock }),
}));
vi.mock('@/lib/data/use-collection', () => ({
  useCollection: (key: string) => {
    if (key === 'pedidos') return { items: PEDIDOS, create: createMock, update: updateMock, remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
    return { items: [], create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
  },
}));

// Mock configurable de api/client: por defecto modo local/demo; el test de KPIs server-side
// activa `apiState.enabled` para simular el modo API (vi.hoisted evita el TDZ del factory).
const { apiState, apiFetchMock } = vi.hoisted(() => ({
  apiState: { enabled: false },
  apiFetchMock: vi.fn(),
}));
vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => apiState.enabled, apiFetch: apiFetchMock }));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
  useTenantBranding: () => ({ primary: '#000', secondary: '#fff', logoText: 'AB' }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

afterEach(() => { cleanup(); updateMock.mockReset(); createMock.mockReset(); apiFetchMock.mockReset(); confirmMock.mockClear(); apiState.enabled = false; });

describe('pedidos/page — documental (Fase 3)', () => {
  it('muestra métricas y lista los pedidos', () => {
    render(<Page />);
    expect(screen.getByText('P-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getAllByText('Ver / Imprimir')).toHaveLength(PEDIDOS.length);
    expect(screen.getByText('1452.00 €')).toBeInTheDocument(); // total pago único fila 1
    // KPIs en modo local/demo: cálculo cliente sobre el array COMPLETO (sin paginación).
    expect(screen.getByText('2')).toBeInTheDocument();        // Pedidos
    expect(screen.getByText('1')).toBeInTheDocument();        // Aceptados
    expect(screen.getByText('2480.50 €')).toBeInTheDocument(); // Importe = 1452 + 1028.5
  });

  it('modo API: los KPIs vienen de `metrics` del server (todo el negocio), no de la página cargada', async () => {
    // Regresión del fix de subconteo (mismo bug que Facturas/PR-3): useCollection solo tiene
    // la página cargada (2 pedidos), pero GET /pedidos devuelve `metrics` sobre TODOS los
    // pedidos del negocio (57). Los KPIs deben mostrar 57/21/€12345.00, NO 2/1/€2480.50.
    apiState.enabled = true;
    apiFetchMock.mockResolvedValue({
      items: PEDIDOS, total: 57, page: 1, limit: 20,
      metrics: { totalPedidos: 57, aceptados: 21, importeTotal: 12345 },
    });
    render(<Page />);
    expect(await screen.findByText('57')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('12345.00 €')).toBeInTheDocument();
    expect(screen.queryByText('2480.50 €')).toBeNull(); // ya no se subcuenta sobre la página
    expect(apiFetchMock).toHaveBeenCalledWith('/pedidos');
    // El formulario de alta vincula clientes REALES (GET /customers), no el mock local.
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/customers?limit=100'));

    // La sugerencia de nº también sale del total del negocio (57 + 1), no de items.length.
    fireEvent.click(screen.getByText('+ Nuevo presupuesto'));
    const year = new Date().getFullYear();
    expect(screen.getByDisplayValue(`P-${year}-058`)).toBeInTheDocument();
  });

  it('modo local: la sugerencia de nº se deriva del total de pedidos', () => {
    render(<Page />);
    fireEvent.click(screen.getByText('+ Nuevo presupuesto'));
    const year = new Date().getFullYear();
    expect(screen.getByDisplayValue(`P-${year}-003`)).toBeInTheDocument(); // 2 pedidos → 003
  });

  it('Ver / Imprimir abre la vista previa imprimible del pedido', () => {
    render(<Page />);
    fireEvent.click(screen.getAllByText('Ver / Imprimir')[0]);
    expect(screen.getByRole('heading', { name: 'Presupuesto' })).toBeInTheDocument();
    expect(screen.getByText('Imprimir')).toBeInTheDocument();
  });

  it('el estado es un <select> con las opciones en MAYÚSCULAS', () => {
    render(<Page />);
    // Un control (crm 5a) por fila; el literal real es minúsculas, se MUESTRA en mayúsculas.
    expect(screen.getByDisplayValue('GENERADA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ACEPTADA')).toBeInTheDocument();
  });

  it('cambiar el <select> a ACEPTADA confirma y luego llama a update con el nuevo estado (local)', async () => {
    render(<Page />);
    fireEvent.change(screen.getByDisplayValue('GENERADA'), { target: { value: 'aceptada' } });
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(3101, { estado: 'aceptada' }));
    expect(confirmMock).toHaveBeenCalledTimes(1); // aceptar pide visto bueno antes del cambio
  });

  it('si se CANCELA la confirmación de ACEPTADA no llama a update y revierte el chip', async () => {
    confirmMock.mockResolvedValueOnce(false);
    render(<Page />);
    fireEvent.change(screen.getByDisplayValue('GENERADA'), { target: { value: 'aceptada' } });
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(updateMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByDisplayValue('GENERADA')).toBeInTheDocument()); // revertido
  });

  it('modo API: cambiar el <select> a RECHAZADA confirma y llama a PUT /pedidos/:id/status', async () => {
    apiState.enabled = true;
    apiFetchMock.mockResolvedValue({
      items: PEDIDOS, total: 2, page: 1, limit: 20,
      metrics: { totalPedidos: 2, aceptados: 1, importeTotal: 0 },
    });
    render(<Page />);
    fireEvent.change(await screen.findByDisplayValue('GENERADA'), { target: { value: 'rechazada' } });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/pedidos/3101/status', { method: 'PUT', body: JSON.stringify({ estado: 'rechazada' }) }));
  });

  it('el filtro oculta las filas que no casan por cliente', async () => {
    render(<Page />);
    expect(screen.getByText('P-2026-001')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nº/i), { target: { value: 'Lucía' } });
    await waitFor(() => expect(screen.queryByText('P-2026-001')).toBeNull()); // debounce 300ms
    expect(screen.getByText('P-2026-002')).toBeInTheDocument();
  });

  it('"+ Nuevo pedido" abre el formulario de alta (flujo separado del TPV)', () => {
    render(<Page />);
    fireEvent.click(screen.getByText('+ Nuevo presupuesto'));
    expect(screen.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeInTheDocument();
  });

  it('las cabeceras Nº Presupuesto/Cliente/Fecha/Estado son ordenables; Total no', () => {
    render(<Page />);
    expect(screen.getByRole('button', { name: 'Ordenar por Nº Presupuesto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenar por Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenar por Fecha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenar por Estado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ordenar por Total' })).toBeNull();
  });

  it('ordena por Cliente client-side (desc invierte el orden de filas)', () => {
    render(<Page />);
    const numeroDeFila = (i: number) => within(screen.getAllByRole('row')[i + 1]).getByText(/^P-2026-/).textContent;
    // Orden por defecto (createdAt del mock): P-2026-001 primero.
    expect(numeroDeFila(0)).toBe('P-2026-001');
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Cliente' })); // asc: Ana, Lucía
    expect(numeroDeFila(0)).toBe('P-2026-001');
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Cliente' })); // desc: Lucía, Ana
    expect(numeroDeFila(0)).toBe('P-2026-002');
  });

  it('Editar (icono AA) abre el formulario precargado y guarda con PATCH (update) el presupuesto', () => {
    render(<Page />);
    // La fila aceptada (P-2026-002) NO ofrece Editar; solo la generada. Botón-icono (crm 5c).
    expect(screen.getAllByTitle('Editar')).toHaveLength(1);
    fireEvent.click(screen.getByTitle('Editar'));
    expect(screen.getByRole('heading', { name: 'Editar presupuesto' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('P-2026-001')).toBeInTheDocument(); // nº precargado (sin sufijo)

    fireEvent.click(screen.getByText('Guardar cambios'));
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toBe(3101);
    expect((updateMock.mock.calls[0][1] as { numero: string }).numero).toBe('P-2026-001');
  });

  // Último test: vacía PEDIDOS in situ (el mock cierra sobre esta referencia).
  it('lista vacía → estado vacío', () => {
    PEDIDOS.length = 0;
    render(<Page />);
    expect(screen.getByText('Aún no hay presupuestos')).toBeInTheDocument();
    expect(screen.queryByText('Ver / Imprimir')).toBeNull();
  });
});
