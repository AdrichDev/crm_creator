import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Cliente } from '@/lib/mock/data';
import Page from '@/app/(crm)/clientes/page';

// Ordenación por cabecera de la Cartera de Clientes (reemplaza a los filtros retirados).
// Columnas ordenables: Id Cliente, Empresa (razonSocial), Contacto (nombre) y Email.
// En modo generador (sin API) el orden se aplica client-side sobre la colección.

const CLIENTES: Cliente[] = [
  { id: 1, nombre: 'Bruno', email: 'b@mail.com', telefono: '600000001', visitas: 1, gastoTotal: 10, segmento: 'Nuevo', ultimaVisita: '2026-06-01', nombreComercial: 'Zeta Marca', razonSocial: 'Zeta SL' },
  { id: 2, nombre: 'Ana', email: 'a@mail.com', telefono: '600000002', visitas: 2, gastoTotal: 20, segmento: 'Nuevo', ultimaVisita: '2026-06-02', nombreComercial: 'Alfa Marca', razonSocial: 'Alfa SL' },
];

vi.mock('@/lib/data/use-collection', () => ({
  useCollection: (key: string) => {
    if (key === 'clientes') return { items: CLIENTES, create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
    return { items: [], create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
  },
}));

vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => false, apiFetch: vi.fn() }));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useTenantConfig: () => ({ config: { business: { vertical: 'peluqueria' }, modules: { clientes: true } }, ready: true }),
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/clientes',
}));

afterEach(() => cleanup());

// Orden de los nombres visibles (columna Contacto), fila a fila.
function nombres(): (string | null)[] {
  return screen.getAllByRole('row').slice(1).map((r) => within(r).getByText(/^(Ana|Bruno)$/).textContent);
}

describe('clientes/page — ordenación por cabecera (modo generador)', () => {
  it('las cabeceras ordenables exponen un botón de ordenación; Teléfono/Facturas/Acciones no', () => {
    render(<Page />);
    expect(screen.getByRole('button', { name: 'Ordenar por Id Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenar por Empresa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenar por Contacto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordenar por Email' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ordenar por Teléfono' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ordenar por Facturas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ordenar por Acciones' })).toBeNull();
  });

  it('ya no muestra los inputs de filtro retirados (nombre/email/fecha)', () => {
    render(<Page />);
    expect(screen.queryByLabelText('Filtrar por nombre')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por email')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por fecha')).toBeNull();
  });

  it('pulsar Contacto ordena asc; volver a pulsar invierte a desc', () => {
    render(<Page />);
    const contacto = screen.getByRole('button', { name: 'Ordenar por Contacto' });

    fireEvent.click(contacto);
    expect(nombres()).toEqual(['Ana', 'Bruno']);
    // La cabecera activa marca la dirección ascendente.
    expect(screen.getByRole('columnheader', { name: /Contacto/ })).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(contacto);
    expect(nombres()).toEqual(['Bruno', 'Ana']);
    expect(screen.getByRole('columnheader', { name: /Contacto/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('ordena por Empresa (nombreComercial) asc: Alfa Marca (Ana) antes que Zeta Marca (Bruno)', () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Empresa' }));
    expect(nombres()).toEqual(['Ana', 'Bruno']);
  });
});
