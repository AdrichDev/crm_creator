import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { AgendaWidget } from '@/components/panel/widgets/agenda-widget';

const routerPush = vi.fn();

// useCollection resuelve su backend (mock) en una promesa; se vacía la cola de
// microtasks tras cada render para evitar el warning "not wrapped in act".
async function flush() {
  await act(async () => { await Promise.resolve(); });
}

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  routerPush.mockClear();
});

describe('AgendaWidget — vistas mes/semana/día', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-06-30 es martes; junio 2026 tiene 30 días (sin ambigüedad de "30" repetido).
    vi.setSystemTime(new Date(2026, 5, 30));
  });

  it('arranca en vista mes con el día de hoy seleccionado', async () => {
    const { container } = render(<AgendaWidget />);
    await flush();
    const activo = container.querySelector('.calendar-day.active');
    expect(activo?.textContent).toContain('30');
  });

  it('cambiar a vista semana conserva el día seleccionado (spec W-S7)', async () => {
    const { container } = render(<AgendaWidget />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));

    const dias = container.querySelectorAll('.agenda-week-col');
    expect(dias).toHaveLength(7); // semana siempre 7 columnas, sin huecos
    const activo = container.querySelector('.agenda-week-col.active');
    expect(activo?.textContent).toContain('30');
  });

  it('cambiar a vista día oculta el grid y muestra la franja horaria con la fecha conservada', async () => {
    const { container } = render(<AgendaWidget />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));

    expect(container.querySelector('.calendar-days')).toBeNull();
    expect(container.querySelector('.agenda-hour-grid')).toBeTruthy();
    expect(container.querySelectorAll('.agenda-hour-row').length).toBeGreaterThan(0);
    expect(container.querySelector('.agenda-widget-nav')?.textContent).toMatch(/30 de junio/i);
  });

  it('vista día muestra filas para 07:00–22:00 por defecto', async () => {
    const { container } = render(<AgendaWidget />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));

    const labels = Array.from(container.querySelectorAll('.agenda-hour-label')).map((n) => n.textContent);
    expect(labels[0]).toBe('07:00');
    expect(labels.at(-1)).toBe('22:00');
    expect(labels).toHaveLength(16); // 07..22 inclusive
  });

  it('vista semana muestra las citas de cada día dentro de su columna', async () => {
    vi.setSystemTime(new Date(2026, 5, 16)); // martes; el mock tiene citas el 2026-06-16 y 06-17
    const { container } = render(<AgendaWidget />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));

    const tarjetas = container.querySelectorAll('.agenda-week-col-body .appointment-card-compact');
    expect(tarjetas.length).toBeGreaterThan(0);
  });

  it('clicar otro día lo selecciona', async () => {
    const { container } = render(<AgendaWidget />);
    await flush();
    const dias = container.querySelectorAll('.calendar-day:not(.empty)');
    const dia15 = Array.from(dias).find((d) => d.textContent?.includes('15'));
    expect(dia15).toBeTruthy();

    fireEvent.click(dia15!);
    expect(dia15).toHaveClass('active');
  });

  // crm-citas-ux-agenda WU5.2: click en una cita abre el modal de detalle (no navega
  // directo); "Ir a agenda" es la única acción que sigue navegando a /citas?edit=id.
  it('click en una cita del día abre el modal de detalle en vez de navegar', async () => {
    vi.setSystemTime(new Date(2026, 5, 16)); // el mock tiene citas el 2026-06-16
    const { container } = render(<AgendaWidget />);
    await flush();
    const tarjeta = container.querySelector('.appointment-card');
    expect(tarjeta).toBeTruthy();
    fireEvent.click(tarjeta!);

    expect(screen.getByText('Detalle de cita')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('"Ir a agenda" en el modal de detalle navega a /citas?edit=id y cierra el modal', async () => {
    vi.setSystemTime(new Date(2026, 5, 16)); // el mock tiene citas el 2026-06-16
    const { container } = render(<AgendaWidget />);
    await flush();
    fireEvent.click(container.querySelector('.appointment-card')!);
    expect(screen.getByText('Detalle de cita')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ir a agenda' }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/^\/citas\?edit=/));
    expect(screen.queryByText('Detalle de cita')).toBeNull();
  });
});
