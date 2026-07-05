import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import Page from '@/app/(crm)/citas/page';
import { AgendaWidget } from '@/components/panel/widgets/agenda-widget';

// crm-operaos-agenda-contactos-fichaje-telegram WU1 (AC1): "la sección
// Agenda/Citas/Reservas usa exactamente la vista del widget principal, adaptada
// a pantalla de módulo". Este archivo cubre (1) que /citas comparte el mismo
// calendario base (AgendaGrid: nav, vistas, grid mensual) que AgendaWidget —
// DIVERGE a propósito en el listado de citas: /citas usa `sidePanel` (panel
// lateral tipo agents-agency, `.agenda-dia-panel`), el widget del inicio (tile
// pequeño) mantiene el listado bajo el grid (`.agenda-widget-day-list`) — y
// (2) que la terminología sectorial (citas/reservas/clases) sigue viva en la
// vista full-screen.

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/citas',
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: vi.fn().mockResolvedValue(undefined), confirm: vi.fn().mockResolvedValue(true) }),
}));

let term = 'Citas';
vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, _fallback: string) => term,
  useTenantConfig: () => ({ config: { business: { vertical: 'peluqueria' }, modules: { citas: true } }, ready: true }),
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
}));

async function flush() { await act(async () => { await Promise.resolve(); }); }

beforeEach(() => {
  term = 'Citas';
  // Mismo seed/fecha que agenda-widget.test.tsx (2026-06-16 tiene citas mock).
  vi.setSystemTime(new Date(2026, 5, 16));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('citas/page — vista full-screen comparte gramática con AgendaWidget (WU1 AC1)', () => {
  it('/citas renderiza la misma estructura de calendario (nav + vistas + grid mensual) que el widget', async () => {
    const { container: widgetContainer } = render(<AgendaWidget />);
    await flush();
    const { container: pageContainer } = render(<Page />);
    await flush();

    for (const cls of ['.agenda-widget', '.agenda-widget-nav', '.agenda-widget-views', '.calendar-grid-header', '.calendar-days-mes']) {
      expect(widgetContainer.querySelector(cls)).toBeTruthy();
      expect(pageContainer.querySelector(cls)).toBeTruthy();
    }
    // Divergencia intencional: widget = listado bajo el grid, /citas = panel lateral.
    expect(widgetContainer.querySelector('.agenda-widget-day-list')).toBeTruthy();
    expect(pageContainer.querySelector('.agenda-dia-panel')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Mes' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Semana' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Día' }).length).toBeGreaterThan(0);
  });

  it('/citas muestra tarjetas de evento (.cita-full-card) en el panel lateral, con el día 16 seleccionado', async () => {
    const { container } = render(<Page />);
    await flush();

    const tarjetas = container.querySelectorAll('.agenda-dia-panel-lista .cita-full-card');
    expect(tarjetas.length).toBeGreaterThan(0);
  });
});

describe('citas/page — terminología sectorial (citas/reservas/clases)', () => {
  it('con terminología "Reservas" (hostelería), el título y el estado vacío usan el término del tenant', async () => {
    term = 'Reservas';
    // Día sin citas del seed (2026-06-18) para comprobar el mensaje de estado vacío.
    vi.setSystemTime(new Date(2026, 5, 18));
    render(<Page />);
    await flush();

    expect(screen.getByRole('heading', { name: 'Reservas' })).toBeInTheDocument();
    expect(screen.getByText('Sin reservas este día.')).toBeInTheDocument();
  });

  it('con terminología "Clases" (fitness), el título y el estado vacío usan el término del tenant', async () => {
    term = 'Clases';
    vi.setSystemTime(new Date(2026, 5, 18));
    render(<Page />);
    await flush();

    expect(screen.getByRole('heading', { name: 'Clases' })).toBeInTheDocument();
    expect(screen.getByText('Sin clases este día.')).toBeInTheDocument();
  });
});
