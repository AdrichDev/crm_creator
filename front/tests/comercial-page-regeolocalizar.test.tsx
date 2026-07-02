import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import Page from '@/app/(crm)/comercial/page';

// crm-geo-real-clientes WU2: acción "Re-geolocalizar" en la vista comercial
// (lista de pendientes de geolocalizar), visible solo para quien puede editar
// el módulo (gestor), que invoca el endpoint batch y refresca los datos.
const fetchCustomersMock = vi.fn();
const geocodeRerunMock = vi.fn();
vi.mock('@/lib/comercial/api', () => ({
  fetchCustomers: (...a: unknown[]) => fetchCustomersMock(...a),
  fetchVisitStates: () => Promise.resolve([]),
  createCustomer: vi.fn(),
  fetchReminders: () => Promise.resolve([]),
  patchReminder: vi.fn(),
  geocodeRerun: (...a: unknown[]) => geocodeRerunMock(...a),
}));

vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => true }));

vi.mock('next/dynamic', () => ({ default: () => () => null }));

const alertMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: alertMock, confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
  useProjects: () => ({ activeId: 'proj1' }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/comercial',
}));

const PENDIENTE = {
  id: 'c1', nombre: 'Sin Geo', email: '', telefono: '', direccion: 'Calle X',
  visitas: 0, gastoTotal: 0, ultimaVisita: '', segmento: 'Nuevo', estado: 'ACTIVE',
  latitud: null, longitud: null, geoEstado: 'PENDING', categoriaAbc: null,
  tipoRegistro: 'CLIENTE', estadoVisitaId: null, estadoVisita: null, proximaAccionEn: null,
};

afterEach(() => { cleanup(); fetchCustomersMock.mockReset(); geocodeRerunMock.mockReset(); alertMock.mockClear(); });
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('comercial/page — acción "Re-geolocalizar" (WU2)', () => {
  it('gestor ve el botón cuando hay pendientes; al pulsar invoca el endpoint y refresca', async () => {
    fetchCustomersMock.mockResolvedValue({ items: [PENDIENTE], total: 1 });
    geocodeRerunMock.mockResolvedValue({ ok: 1, failed: 0, skipped: 0 });

    render(<Page />);
    await flush();

    const btn = screen.getByText('Re-geolocalizar');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    await flush();

    expect(geocodeRerunMock).toHaveBeenCalledWith(false);
    // refresca: fetchCustomers se llama al montar y otra vez tras el rerun.
    expect(fetchCustomersMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('1 ubicados'));
  });

  it('sin pendientes de geolocalizar, no se muestra el botón', async () => {
    fetchCustomersMock.mockResolvedValue({ items: [], total: 0 });

    render(<Page />);
    await flush();

    expect(screen.queryByText('Re-geolocalizar')).toBeNull();
  });
});
