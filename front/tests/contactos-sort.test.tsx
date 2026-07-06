import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ContactoRow } from '@/components/crm/contactos-lista';
import Page from '@/app/(crm)/contactos/page';

// Ordenación por cabecera de la agenda de Contactos (reemplaza a los filtros retirados).
// Columnas ordenables: Código, Tipo, Nombre, Email, Sector y Fecha de alta.
// En modo generador el orden se aplica client-side; fechas de alta pasadas para no
// disparar la insignia "N" (que alteraría el texto de la celda Nombre).

const CONTACTOS: ContactoRow[] = [
  { id: 'c1', codigo: 'pc-02', tipo: 'prospecto', nombre: 'Bruno', telefono: '600000001', email: 'b@x.com', sector: 'Retail', direccion: null, peticion: null, contactado: 'si', createdAt: '2026-01-02T10:00:00.000Z' },
  { id: 'c2', codigo: 'pc-01', tipo: 'lead', nombre: 'Ana', telefono: '600000002', email: 'a@x.com', sector: 'Hosteleria', direccion: null, peticion: null, contactado: 'no', createdAt: '2026-01-01T10:00:00.000Z' },
];

vi.mock('@/lib/data/use-collection', () => ({
  useCollection: (key: string) => {
    if (key === 'contactos') return { items: CONTACTOS, create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
    return { items: [], create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() };
  },
}));

vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => false, apiFetch: vi.fn() }));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
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
  usePathname: () => '/contactos',
}));

afterEach(() => cleanup());

function nombres(): (string | null)[] {
  return screen.getAllByRole('row').slice(1).map((r) => within(r).getByText(/^(Ana|Bruno)$/).textContent);
}

describe('contactos/page — ordenación por cabecera (modo generador)', () => {
  it('las cabeceras ordenables exponen botón; Teléfono/Contactado/Acciones no', () => {
    render(<Page />);
    for (const label of ['Código', 'Tipo', 'Nombre', 'Email', 'Sector', 'Fecha de alta']) {
      expect(screen.getByRole('button', { name: `Ordenar por ${label}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Ordenar por Teléfono' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ordenar por Contactado' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ordenar por Acciones' })).toBeNull();
  });

  it('ya no muestra los filtros retirados (tipo/contactado/código/nombre/email/sector/fecha)', () => {
    render(<Page />);
    expect(screen.queryByLabelText('Filtrar por tipo')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por contactado')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por código')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por nombre')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por email')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por sector')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por fecha')).toBeNull();
    // El buscador de texto se conserva.
    expect(screen.getByPlaceholderText('Buscar contacto...')).toBeInTheDocument();
  });

  it('pulsar Código ordena asc; volver a pulsar invierte a desc', () => {
    render(<Page />);
    const codigo = screen.getByRole('button', { name: 'Ordenar por Código' });

    fireEvent.click(codigo);
    expect(nombres()).toEqual(['Ana', 'Bruno']); // pc-01 (Ana) antes que pc-02 (Bruno)
    expect(screen.getByRole('columnheader', { name: /Código/ })).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(codigo);
    expect(nombres()).toEqual(['Bruno', 'Ana']);
    expect(screen.getByRole('columnheader', { name: /Código/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('ordena por Nombre asc', () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Nombre' }));
    expect(nombres()).toEqual(['Ana', 'Bruno']);
  });
});
