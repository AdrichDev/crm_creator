// Configuración → pestaña "Negocio": el editor de horario se reutiliza aquí.
// Prefill desde GET /config/horario (OpeningHour reales) y guardado por PUT.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch, isApiEnabled: () => true, apiBaseUrl: () => 'http://x' }));

const alertMock = vi.fn();
const confirmMock = vi.fn();
vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: alertMock, confirm: confirmMock }),
}));

const updateSpy = vi.fn();
vi.mock('@/lib/tenant-config-context', () => ({
  useTenantConfig: () => ({
    config: { business: { name: 'Salón A', vertical: 'peluqueria' }, tenantEnabled: true, horario: undefined },
    update: updateSpy,
    reset: vi.fn(),
    toggleModule: vi.fn(), setModuleEmoji: vi.fn(), toggleWorkerChip: vi.fn(), toggleDashboardWidget: vi.fn(),
  }),
  useRole: () => ({ role: 'admin' }),
}));

// ModuleGuard: passthrough (no gating en el test).
vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ConfiguracionPage from '@/app/(crm)/configuracion/page';

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const GET_HORARIO = {
  locationId: 'loc1',
  tramos: [
    { diaSemana: 1, inicio: '09:00', fin: '17:00' },
    { diaSemana: 2, inicio: '09:00', fin: '17:00' },
    { diaSemana: 3, inicio: '09:00', fin: '17:00' },
    { diaSemana: 4, inicio: '09:00', fin: '17:00' },
    { diaSemana: 5, inicio: '09:00', fin: '17:00' },
  ],
};

describe('ConfiguracionPage — pestaña Negocio: horario prefill + guardar', () => {
  beforeEach(() => {
    apiFetch.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/config/horario' && (!init || init.method === undefined)) return GET_HORARIO;
      if (path === '/config/horario' && init?.method === 'PUT') return { locationId: 'loc1', tramos: GET_HORARIO.tramos };
      return undefined;
    });
    alertMock.mockReset().mockResolvedValue(undefined);
    updateSpy.mockReset();
  });
  afterEach(() => cleanup());

  it('al entrar en Negocio hace GET /config/horario y prefila el editor', async () => {
    render(<ConfiguracionPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Negocio' }));
    await flush();
    // GET sin init (una sola arg) al endpoint del horario.
    expect(apiFetch).toHaveBeenCalledWith('/config/horario');
    // Prefill: un grupo L-V continuo → radio "Horario continuo (grupo 1)" presente y marcado.
    const continuo = screen.getByRole('radio', { name: 'Horario continuo (grupo 1)' });
    expect(continuo).toHaveAttribute('aria-checked', 'true');
    const inicio = screen.getByLabelText('Inicio tramo 1 (grupo 1)') as HTMLInputElement;
    expect(inicio.value).toBe('09:00');
  });

  it('"Guardar horario" hace PUT /config/horario con los tramos y sincroniza la config', async () => {
    render(<ConfiguracionPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Negocio' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await flush();
    const putCall = apiFetch.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(putCall![0]).toBe('/config/horario');
    const body = JSON.parse(putCall![1]!.body as string);
    expect(body.tramos).toEqual(GET_HORARIO.tramos);
    // Sincroniza la config local y avisa del resultado.
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ horario: expect.any(Object) }));
    expect(alertMock).toHaveBeenCalledWith(expect.stringMatching(/guardado correctamente/i));
  });
});
