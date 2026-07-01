import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { WidgetGrid } from '@/components/panel/widget-grid';
import { DASHBOARD_WIDGETS } from '@/lib/config/dashboard-widgets';
import { emptyModules } from '@/lib/config/tenant-config';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
}));

afterEach(() => cleanup());

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

const ALL_MODULES_ON = (() => {
  const m = { ...emptyModules() };
  for (const w of DASHBOARD_WIDGETS) if (w.dependsOn) m[w.dependsOn] = true;
  return m;
})();

describe('WidgetGrid', () => {
  it('sin widgets seleccionados → empty state con link a Configuración', async () => {
    render(<WidgetGrid selected={[]} modules={ALL_MODULES_ON} />);
    await flush();
    expect(screen.getByText(/Elegir widgets en Configuración/i)).toBeInTheDocument();
  });

  it('renderiza una tile por cada widget activo, con su clase de tamaño', async () => {
    const { container } = render(
      <WidgetGrid selected={['agenda', 'kpis-hoy', 'ventas-hoy']} modules={ALL_MODULES_ON} />,
    );
    await flush();
    expect(container.querySelectorAll('.widget-tile')).toHaveLength(3);
    expect(container.querySelector('.widget-lg')).toBeTruthy(); // agenda
    expect(container.querySelectorAll('.widget-md')).toHaveLength(1); // kpis-hoy
    expect(container.querySelectorAll('.widget-sm')).toHaveLength(1); // ventas-hoy
  });

  it('un widget con módulo apagado no se renderiza aunque esté seleccionado', async () => {
    const modules = { ...ALL_MODULES_ON, ventas: false };
    const { container } = render(
      <WidgetGrid selected={['agenda', 'ventas-hoy']} modules={modules} />,
    );
    await flush();
    expect(container.querySelectorAll('.widget-tile')).toHaveLength(1);
  });

  it('selección con los 8 widgets del catálogo nunca renderiza más de 6 tiles', async () => {
    const todos = DASHBOARD_WIDGETS.map((w) => w.id);
    const { container } = render(<WidgetGrid selected={todos} modules={ALL_MODULES_ON} />);
    await flush();
    expect(container.querySelectorAll('.widget-tile').length).toBeLessThanOrEqual(6);
  });
});
