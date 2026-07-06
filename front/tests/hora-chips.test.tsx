import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { HoraChips } from '@/components/crm/hora-chips';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

afterEach(() => { cleanup(); apiFetchMock.mockReset(); });
async function flush() { await act(async () => { await Promise.resolve(); }); }

describe('HoraChips (crm-citas-ux-agenda WU3 / AC3)', () => {
  it('sin fecha/servicio muestra el hint y no llama al fetch', async () => {
    render(<HoraChips fecha="" serviceId="" value="" onChange={vi.fn()} onFallback={vi.fn()} />);
    await flush();
    expect(screen.getByText(/Elige fecha y servicio primero/)).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('renderiza chips y deshabilita los ocupados', async () => {
    apiFetchMock.mockResolvedValue({ slots: [
      { hora: '09:00', disponible: true },
      { hora: '09:30', disponible: false },
    ] });
    render(<HoraChips fecha="2026-07-10" serviceId="sv1" value="" onChange={vi.fn()} onFallback={vi.fn()} />);
    await flush();
    const libre = await screen.findByRole('button', { name: '09:00' });
    const ocupado = screen.getByRole('button', { name: '09:30' });
    expect(libre).not.toBeDisabled();
    expect(ocupado).toBeDisabled();
  });

  it('click en un chip disponible fija la hora', async () => {
    apiFetchMock.mockResolvedValue({ slots: [{ hora: '10:00', disponible: true }] });
    const onChange = vi.fn();
    render(<HoraChips fecha="2026-07-10" serviceId="sv1" value="" onChange={onChange} onFallback={vi.fn()} />);
    const chip = await screen.findByRole('button', { name: '10:00' });
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith('10:00');
  });

  it('si el fetch de slots falla, avisa con onFallback (degrada al input time)', async () => {
    apiFetchMock.mockRejectedValue(new Error('API no configurada'));
    const onFallback = vi.fn();
    render(<HoraChips fecha="2026-07-10" serviceId="sv1" value="" onChange={vi.fn()} onFallback={onFallback} />);
    await flush();
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  // Regresión (pedido varias veces): el chip disponible y NO elegido debe verse gris
  // (--panel-muted, theme-aware) — antes usaba --panel-text (el texto fuerte del panel).
  it('chip disponible y no elegido usa --panel-muted (gris en ambos temas)', async () => {
    apiFetchMock.mockResolvedValue({ slots: [{ hora: '11:00', disponible: true }] });
    render(<HoraChips fecha="2026-07-10" serviceId="sv1" value="" onChange={vi.fn()} onFallback={vi.fn()} />);
    const chip = await screen.findByRole('button', { name: '11:00' });
    expect(chip.className).toMatch(/text-\[var\(--panel-muted\)\]/);
    expect(chip.className).not.toMatch(/text-\[var\(--panel-text\)\]/);
  });
});
