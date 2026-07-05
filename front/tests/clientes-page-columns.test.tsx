import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Cliente } from '@/lib/mock/data';
import Page from '@/app/(crm)/clientes/page';

// Segunda pasada sobre "Cartera de Clientes": columnas exactas Id Cliente, Nombre,
// Teléfono, Email, [icono info], Acciones, Facturas (sin Contacto/Visitas/Gasto/Segmento
// como columnas de tabla — esos datos viven ahora en el modal de ficha).

const CLIENTES: Cliente[] = [
  { id: 1, nombre: 'Ana Gómez', email: 'ana@mail.com', telefono: '600111222', visitas: 5, gastoTotal: 300, segmento: 'VIP', ultimaVisita: '2026-06-10', direccion: 'Calle Falsa 1' },
];

vi.mock('@/lib/data/use-collection', () => ({
  useCollection: (key: string) => {
    if (key === 'clientes') return { items: CLIENTES, create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
    if (key === 'facturas') return { items: [], create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
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

const confirmMock = vi.fn().mockResolvedValue(true);
vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: vi.fn(), confirm: confirmMock }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/clientes',
}));

afterEach(() => cleanup());

describe('clientes/page — columnas de la tabla (2ª pasada)', () => {
  it('cabecera exacta: Id Cliente, Nombre, Teléfono, Email, [info], Acciones, Facturas', () => {
    render(<Page />);
    const headerCells = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headerCells).toEqual(['Id Cliente', 'Nombre', 'Teléfono', 'Email', '', 'Acciones', 'Facturas']);
  });

  it('no muestra Segmento, Visitas, Gasto ni una columna Contacto combinada', () => {
    render(<Page />);
    const headerCells = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headerCells).not.toContain('Segmento');
    expect(headerCells).not.toContain('Visitas');
    expect(headerCells).not.toContain('Gasto');
    expect(headerCells).not.toContain('Contacto');
  });

  it('la fila muestra teléfono y email en columnas separadas', () => {
    render(<Page />);
    const row = screen.getByText('Ana Gómez').closest('tr')!;
    expect(within(row).getByText('600111222')).toBeInTheDocument();
    expect(within(row).getByText('ana@mail.com')).toBeInTheDocument();
  });

  it('el botón de info abre el modal con visitas, gasto total y gasto pendiente de cobro', () => {
    render(<Page />);
    fireEvent.click(screen.getByTitle('Ver ficha y documentos'));
    expect(screen.getByText('Gasto pendiente de cobro')).toBeInTheDocument();
    // Visitas y Gasto total siguen disponibles, pero dentro del modal (no en la tabla).
    expect(screen.getByText('Visitas')).toBeInTheDocument();
    expect(screen.getByText('Gasto total')).toBeInTheDocument();
  });

  it('la columna Facturas está separada de Acciones (editar/eliminar)', () => {
    render(<Page />);
    const row = screen.getByText('Ana Gómez').closest('tr')!;
    expect(within(row).getByTitle('Editar')).toBeInTheDocument();
    expect(within(row).getByTitle('Eliminar')).toBeInTheDocument();
    // Botón de facturas (antes viviá dentro de Acciones), ahora en su propia columna.
    expect(within(row).getByTitle('Sin facturas — ir a facturación')).toBeInTheDocument();
  });
});
