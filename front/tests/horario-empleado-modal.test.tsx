import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { HorarioEmpleadoModal } from '@/components/crm/horario-empleado-modal';

afterEach(() => { cleanup(); apiFetch.mockReset(); });
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('HorarioEmpleadoModal (3.2.f)', () => {
  it('carga los tramos con GET y guarda el reemplazo completo con PUT', async () => {
    apiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
      if (!init) return Promise.resolve({ tramos: [{ id: 't1', diaSemana: 1, inicio: '09:00', fin: '13:00' }] });
      // PUT: devuelve lo que se envió (eco).
      return Promise.resolve({ tramos: JSON.parse(init.body!).tramos });
    });

    render(<HorarioEmpleadoModal open employeeId="e1" employeeName="Ana" onClose={vi.fn()} />);
    await flush();

    // El GET pobló un tramo existente.
    expect(apiFetch).toHaveBeenCalledWith('/employees/e1/horario');
    expect((screen.getByLabelText('Inicio') as HTMLInputElement).value).toBe('09:00');

    // Añadir un tramo y guardar → PUT con los 2 tramos.
    fireEvent.click(screen.getByText('Añadir tramo'));
    fireEvent.click(screen.getByText('Guardar'));
    await flush();

    const putCall = apiFetch.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1].body);
    expect(body.tramos).toHaveLength(2);
    expect(body.tramos[0]).toMatchObject({ diaSemana: 1, inicio: '09:00', fin: '13:00' });
  });
});
