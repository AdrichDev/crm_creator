import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import Page from '@/app/(crm)/citas/page';

// crm-citas-ux-agenda WU4 (AC4): editar una cita en modo API debe emitir
// PATCH /bookings/:id y refrescar; un conflicto del back se muestra como error
// sin pisar el estado local (el modal no se cierra).
const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  isApiEnabled: () => true,
}));

const alertMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: alertMock, confirm: vi.fn().mockResolvedValue(true) }),
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

afterEach(() => { cleanup(); apiFetchMock.mockReset(); alertMock.mockClear(); });
async function flush() { await act(async () => { await Promise.resolve(); }); }

async function abrirEdicion() {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW], total: 1, page: 1, limit: 20 });
    return Promise.resolve({ items: [] });
  });
  render(<Page />);
  await flush();
  fireEvent.click(await screen.findByText('Editar'));
  await flush();
}

describe('citas/page — persistencia de edición en modo API (WU4)', () => {
  it('submit del editor llama a PATCH /bookings/:id con el body correcto y refresca', async () => {
    await abrirEdicion();

    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/bookings/bk1' && init?.method === 'PATCH') return Promise.resolve({ ok: true });
      if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW], total: 1, page: 1, limit: 20 });
      return Promise.resolve({ items: [] });
    });

    fireEvent.click(screen.getByText('Guardar'));
    await flush();

    const patchCall = apiFetchMock.mock.calls.find(([p, init]) => p === '/bookings/bk1' && (init as RequestInit)?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.start).toBe('2026-07-10T10:00:00');

    // Modal se cierra y refresca tras un PATCH exitoso.
    await flush();
    expect(screen.queryByText('Guardar')).toBeNull();
  });

  // crm-editar-cita-persistencia WU2: el payload debe llevar TODOS los campos
  // editables, no solo start — status mapeado ES→enum, ids actuales de
  // servicio/empleado y notas.
  it('el body del PATCH incluye status/serviceId/employeeId/notes mapeados', async () => {
    await abrirEdicion();

    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/bookings/bk1' && init?.method === 'PATCH') return Promise.resolve({ ok: true });
      if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW], total: 1, page: 1, limit: 20 });
      return Promise.resolve({ items: [] });
    });

    // EntityModal no asocia <label> con htmlFor/id: se localizan los controles por
    // su valor actual (select) y por ser el único <textarea> del formulario (notas).
    fireEvent.change(screen.getByDisplayValue('Pendiente'), { target: { value: 'Confirmada' } });
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'Cliente pidió cambio de color' } });
    fireEvent.click(screen.getByText('Guardar'));
    await flush();

    const patchCall = apiFetchMock.mock.calls.find(([p, init]) => p === '/bookings/bk1' && (init as RequestInit)?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.status).toBe('CONFIRMED');
    expect(body.serviceId).toBe('s1');
    expect(body.employeeId).toBe('e1');
    expect(body.notes).toBe('Cliente pidió cambio de color');
    expect(body.start).toBe('2026-07-10T10:00:00');
  });

  it('conflicto de disponibilidad (409) muestra error y no pisa el estado local', async () => {
    await abrirEdicion();

    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/bookings/bk1' && init?.method === 'PATCH') return Promise.reject(new Error('No disponible'));
      if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW], total: 1, page: 1, limit: 20 });
      return Promise.resolve({ items: [] });
    });

    fireEvent.click(screen.getByText('Guardar'));
    await flush();

    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('No disponible'));
    // El modal sigue abierto (no se pisa el estado local descartando la edición).
    expect(screen.getByText('Guardar')).toBeInTheDocument();
  });
});

// crm-modales-hover-unificados WU6 (AC4 proposal / paridad crear-editar): el editor
// de citas carga las horas igual que NuevaCitaModal — chips de slots en modo API,
// con fallback a <input type="time"> si el fetch falla o la API no está habilitada.
describe('citas/page — carga de horas al editar (WU6)', () => {
  it('con la API activa y slots disponibles, el editor muestra chips de hora (no un input plano)', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/bookings/slots')) {
        return Promise.resolve({ slots: [{ hora: '10:00', disponible: true }, { hora: '11:00', disponible: false }] });
      }
      if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW], total: 1, page: 1, limit: 20 });
      return Promise.resolve({ items: [] });
    });
    render(<Page />);
    await flush();
    fireEvent.click(await screen.findByText('Editar'));
    await flush();
    await flush();

    expect(screen.getByRole('button', { name: '10:00' })).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it('si el fetch de slots falla, el editor degrada a <input type="time">', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith('/bookings/slots')) return Promise.reject(new Error('fallo de red'));
      if (path.startsWith('/bookings?')) return Promise.resolve({ items: [ROW], total: 1, page: 1, limit: 20 });
      return Promise.resolve({ items: [] });
    });
    render(<Page />);
    await flush();
    fireEvent.click(await screen.findByText('Editar'));
    await flush();
    await flush();

    expect(document.querySelector('input[type="time"]')).toBeInTheDocument();
  });
});
