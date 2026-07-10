// Unit test de la palanca del kill switch en operaOS (crm-tenant-lifecycle-gate WU5).
// Verifica que el front solo transporta el estado destino a `PUT .../lifecycle`:
//   - switch verde → ACTIVE, rojo → SUSPENDED (un solo gesto).
//   - selector fija GRACE (con graceUntil) / TERMINATED con el estado destino.
// Se mockea @/lib/api/operator: no hay red ni service token en el test.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const { setBusinessLifecycle, fetchBusinessStateEvents } = vi.hoisted(() => ({
  setBusinessLifecycle: vi.fn(),
  fetchBusinessStateEvents: vi.fn(),
}));

vi.mock('@/lib/api/operator', () => ({
  setBusinessLifecycle,
  fetchBusinessStateEvents,
}));

import { LifecycleControl } from '@/app/(operador)/negocios/[id]/lifecycle-control';

const BIZ = 'biz-123';

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function lifecycleResult(lifecycle: string) {
  return { id: BIZ, lifecycle, graceUntil: null, suspendedAt: null };
}

describe('LifecycleControl', () => {
  beforeEach(() => {
    setBusinessLifecycle.mockReset().mockImplementation(async (_id: string, p: { state: string }) =>
      lifecycleResult(p.state),
    );
    fetchBusinessStateEvents.mockReset().mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('switch en rojo (negocio suspendido) → click fija ACTIVE', async () => {
    fetchBusinessStateEvents.mockResolvedValue([
      { fromState: 'ACTIVE', toState: 'SUSPENDED', reason: null, actor: 'operator', createdAt: '2026-07-10T10:00:00.000Z' },
    ]);
    render(<LifecycleControl businessId={BIZ} />);
    await flush();

    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false'); // rojo = suspendido

    fireEvent.click(sw);
    await flush();

    expect(setBusinessLifecycle).toHaveBeenCalledWith(BIZ, { state: 'ACTIVE' });
  });

  it('switch en verde (negocio operativo) → click fija SUSPENDED', async () => {
    fetchBusinessStateEvents.mockResolvedValue([]); // sin histórico → ACTIVE por defecto
    render(<LifecycleControl businessId={BIZ} />);
    await flush();

    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true'); // verde = operativo

    fireEvent.click(sw);
    await flush();

    expect(setBusinessLifecycle).toHaveBeenCalledWith(BIZ, { state: 'SUSPENDED' });
  });

  it('selector fija GRACE llamando a PUT con el estado destino y graceUntil', async () => {
    render(<LifecycleControl businessId={BIZ} />);
    await flush();

    // GRACE ya es el valor por defecto del selector; se rellena la fecha de gracia.
    const graceInput = screen.getByLabelText('Fin del periodo de gracia') as HTMLInputElement;
    fireEvent.change(graceInput, { target: { value: '2030-01-01T00:00' } });
    fireEvent.click(screen.getByText('Aplicar'));
    await flush();

    expect(setBusinessLifecycle).toHaveBeenCalledWith(BIZ, {
      state: 'GRACE',
      graceUntil: new Date('2030-01-01T00:00').toISOString(),
    });
  });

  it('selector fija TERMINATED llamando a PUT con el estado destino', async () => {
    render(<LifecycleControl businessId={BIZ} />);
    await flush();

    fireEvent.change(screen.getByLabelText('Estado destino'), { target: { value: 'TERMINATED' } });
    fireEvent.click(screen.getByText('Aplicar'));
    await flush();

    expect(setBusinessLifecycle).toHaveBeenCalledWith(BIZ, { state: 'TERMINATED' });
  });
});
