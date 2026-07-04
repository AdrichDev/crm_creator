import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Factura } from '@/lib/mock/data';
import Page from '@/app/(crm)/facturas/page';

// crm-paridad-facturas-pedidos-aa (Fase 2, tasks 2.1/2.2/2.3): la pantalla Facturas es
// documental — listado + métricas + acción Ver/Imprimir, SIN alta manual (cerrada en PR-2b).

const FACTURAS: Factura[] = [
  { id: 2001, numero: 'F-2026-001', cliente: 'Lucía Fernández', servicio: 'Corte', fecha: '2026-06-10', total: 120, estado: 'Pagada', documentos: [], pedidoId: 'ped_1' },
  { id: 2002, numero: 'F-2026-002', cliente: 'Ana Gómez', servicio: 'Color', fecha: '2026-06-12', total: 72.5, estado: 'Pendiente', documentos: [] },
  { id: 2003, numero: 'F-2026-003', cliente: 'David Soler', servicio: 'Corte', fecha: '2026-06-14', total: 45, estado: 'Pagada', documentos: [] },
];

const updateMock = vi.fn();
vi.mock('@/lib/data/use-collection', () => ({
  useCollection: () => ({ items: FACTURAS, create: vi.fn(), update: updateMock, remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/data/use-documents', () => ({
  useDocumentos: () => ({ docs: [], add: vi.fn(), remove: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => false }));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

afterEach(() => { cleanup(); updateMock.mockReset(); });

describe('facturas/page — documental (Fase 2)', () => {
  it('muestra métricas derivadas de las facturas', () => {
    render(<Page />);
    expect(screen.getByText('€237.50')).toBeInTheDocument();  // importe total (incluye todas), único
    // €72.50 aparece 2 veces: total de la fila F-2026-002 + métrica "Importe pendiente".
    expect(screen.getAllByText('€72.50')).toHaveLength(2);
  });

  it('NO ofrece alta manual (sin botón "Nueva factura")', () => {
    render(<Page />);
    expect(screen.queryByText(/Nueva factura/i)).toBeNull();
  });

  it('lista las facturas con acción Ver / Imprimir', () => {
    render(<Page />);
    expect(screen.getByText('F-2026-001')).toBeInTheDocument();
    expect(screen.getAllByText('Ver / Imprimir')).toHaveLength(FACTURAS.length);
  });

  it('Ver / Imprimir abre la vista previa imprimible de la factura', () => {
    render(<Page />);
    fireEvent.click(screen.getAllByText('Ver / Imprimir')[0]);
    // Cabecera del documento (h2 "Factura") + número + botón Imprimir.
    expect(screen.getByRole('heading', { name: 'Factura' })).toBeInTheDocument();
    expect(screen.getByText('Imprimir')).toBeInTheDocument();
    expect(screen.getByText('Volver')).toBeInTheDocument();
  });

  // Último test del archivo: vacía FACTURAS in situ (el mock cierra sobre esta referencia).
  it('lista vacía → estado vacío en vez de tabla', () => {
    FACTURAS.length = 0;
    render(<Page />);
    expect(screen.getByText('Aún no hay facturas')).toBeInTheDocument();
    expect(screen.queryByText('Ver / Imprimir')).toBeNull();
  });
});
