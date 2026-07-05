import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import Page from '@/app/(crm)/citas/page';

// crm-citas-ux-agenda WU6 (AC6): el nombre del cliente en /citas es clickable y abre
// la ficha completa (fetch por customerId).
const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  isApiEnabled: () => true,
}));

vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: vi.fn().mockResolvedValue(undefined), confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useTenantConfig: () => ({ config: { business: { vertical: 'peluqueria' }, modules: { citas: true } }, ready: true }),
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/citas',
}));

const ROW = {
  id: 'bk1', cliente: 'Ana López', servicio: 'Corte', empleado: 'Bea',
  fecha: '2026-07-10', hora: '10:00', estado: 'Pendiente',
  customerId: 'c1', serviceId: 's1', employeeId: 'e1', locationId: 'l1',
  teamId: null, recurso: null, aforo: null, notes: null,
};
const ROW_TEAM = { ...ROW, id: 'bk2', cliente: 'Equipo A', customerId: null, teamId: 't1' };

// La vista full-screen (WU1 crm-operaos-agenda-contactos-fichaje-telegram) solo
// muestra los eventos del día seleccionado (por defecto, "hoy"); se fija SOLO
// `Date` (sin fake timers globales — findByText/click necesitan setTimeout real)
// al día de ROW para que la tarjeta sea visible sin navegar el calendario.
beforeEach(() => {
  vi.setSystemTime(new Date(2026, 6, 10));
});
afterEach(() => { cleanup(); apiFetchMock.mockReset(); vi.useRealTimers(); });
async function flush() { await act(async () => { await Promise.resolve(); }); }

describe('citas/page — ficha de cliente al clicar el nombre (WU6)', () => {
  it('click en el nombre abre la ficha con los datos del customer', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW], total: 1, page: 1, limit: 20 });
      if (path === '/customers/c1') return Promise.resolve({ id: 'c1', nombre: 'Ana López', email: 'ana@mail.test', telefono: '600', direccion: 'Calle 1' });
      return Promise.resolve({ items: [] });
    });
    render(<Page />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Ana López' }));
    await flush();

    expect(apiFetchMock).toHaveBeenCalledWith('/customers/c1');
    expect(screen.getByText('Ficha de cliente')).toBeInTheDocument();
    expect(screen.getByText('ana@mail.test')).toBeInTheDocument();
  });

  it('fila de reserva de equipo (sin customerId) muestra el nombre como texto plano, no clickable', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW_TEAM], total: 1, page: 1, limit: 20 });
      return Promise.resolve({ items: [] });
    });
    render(<Page />);
    await flush();

    expect(screen.getByText('Equipo A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Equipo A' })).toBeNull();
  });
});
