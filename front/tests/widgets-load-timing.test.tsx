import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { Cita, Cliente, Venta, Factura, Vacacion } from '@/lib/mock/data';
import { buildMonthCells, buildWeekCells } from '@/lib/utils/calendar';
import { activeDashboardWidgets, DASHBOARD_WIDGETS, type WidgetId } from '@/lib/config/dashboard-widgets';
import { emptyModules } from '@/lib/config/tenant-config';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

function timeIt<T>(fn: () => T): { result: T; ms: number } {
  const t0 = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------------------
// 1) Carga pura (sin React): escalado de las funciones de cálculo a distintos
//    volúmenes. No es benchmark de precisión — es un gate de regresión: si una
//    función pasa a ser O(n²) por accidente, el salto entre escalas lo delata.
// ---------------------------------------------------------------------------
describe('Carga — funciones puras a distintos volúmenes', () => {
  function genCitas(n: number): Cita[] {
    return Array.from({ length: n }, (_, i) => {
      const date = new Date(2020, 0, 1);
      date.setDate(date.getDate() + (i % 4000));
      return {
        id: i,
        cliente: `C${i}`,
        servicio: 'Servicio',
        empleado: `E${i % 20}`,
        fecha: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        hora: '10:00',
        estado: ['Confirmada', 'Pendiente', 'Cancelada', 'Completada'][i % 4],
      };
    });
  }

  const escalas = [100, 1_000, 10_000, 50_000];
  const tiempos: Record<number, number> = {};

  it.each(escalas)('agrupar por día (Map) sobre %i citas en tiempo acotado', (n) => {
    const citas = genCitas(n);
    const { ms } = timeIt(() => {
      const map = new Map<string, number>();
      for (const c of citas) map.set(c.fecha, (map.get(c.fecha) ?? 0) + 1);
      return map;
    });
    tiempos[n] = ms;
    console.info(`[carga] agrupar ${n} citas → ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(500);
  });

  it('escalado 50.000 vs 1.000: no más de ~150x el tiempo (descarta O(n²))', () => {
    // Lineal esperaría ~50x; se da margen amplio (150x) para no ser flaky en CI.
    const citas1k = genCitas(1_000);
    const citas50k = genCitas(50_000);
    const t1k = timeIt(() => {
      const map = new Map<string, number>();
      for (const c of citas1k) map.set(c.fecha, (map.get(c.fecha) ?? 0) + 1);
    }).ms;
    const t50k = timeIt(() => {
      const map = new Map<string, number>();
      for (const c of citas50k) map.set(c.fecha, (map.get(c.fecha) ?? 0) + 1);
    }).ms;
    console.info(`[carga] ratio 50k/1k = ${(t50k / Math.max(t1k, 0.01)).toFixed(1)}x (t1k=${t1k.toFixed(2)}ms, t50k=${t50k.toFixed(2)}ms)`);
    expect(t50k).toBeLessThan(Math.max(t1k * 150, 50));
  });

  it('buildMonthCells/buildWeekCells: tiempo independiente del nº de citas (no las reciben)', () => {
    const { ms: msMes } = timeIt(() => {
      for (let i = 0; i < 10_000; i++) buildMonthCells(2024, i % 12);
    });
    const { ms: msSemana } = timeIt(() => {
      for (let i = 0; i < 10_000; i++) buildWeekCells(new Date(2024, 0, 1 + i));
    });
    console.info(`[carga] 10.000 buildMonthCells → ${msMes.toFixed(1)}ms · 10.000 buildWeekCells → ${msSemana.toFixed(1)}ms`);
    expect(msMes).toBeLessThan(1000);
    expect(msSemana).toBeLessThan(1000);
  });

  it('activeDashboardWidgets: 10.000 llamadas con selección variable en tiempo acotado', () => {
    const allIds = DASHBOARD_WIDGETS.map((w) => w.id);
    const modules = { ...emptyModules() };
    for (const w of DASHBOARD_WIDGETS) if (w.dependsOn) modules[w.dependsOn] = true;

    const { ms } = timeIt(() => {
      for (let i = 0; i < 10_000; i++) {
        activeDashboardWidgets(allIds.slice(0, (i % allIds.length) + 1), modules);
      }
    });
    console.info(`[carga] 10.000 activeDashboardWidgets → ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// 2) Carga con React: montar TODO el mosaico (6 widgets, el máximo posible)
//    con datasets grandes y distintos por colección simultáneamente.
// ---------------------------------------------------------------------------
function genCitasFull(n: number): Cita[] {
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(2024, 0, 1);
    date.setDate(date.getDate() + i);
    return {
      id: i, cliente: `Cliente ${i}`, servicio: 'Servicio', empleado: `Emp ${i % 9}`,
      fecha: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      hora: '10:00', estado: 'Confirmada',
    };
  });
}
const BIG = {
  citas: genCitasFull(10_000),
  clientes: Array.from({ length: 5_000 }, (_, i) => ({
    id: i, nombre: `Cliente ${i}`, email: `c${i}@x.com`, telefono: '600', visitas: i % 30, gastoTotal: i, segmento: 'Nuevo', ultimaVisita: '2026-06-01',
  })) as Cliente[],
  ventas: Array.from({ length: 5_000 }, (_, i) => ({
    id: i, fecha: i % 2 === 0 ? new Date().toISOString().slice(0, 10) : '2020-01-01', cliente: `Cliente ${i}`, items: 1, metodo: 'Tarjeta', total: i % 100,
  })) as Venta[],
  facturas: Array.from({ length: 5_000 }, (_, i) => ({
    id: i, numero: `F-${i}`, cliente: `Cliente ${i}`, fecha: '2026-06-01', total: i % 200, estado: i % 3 === 0 ? 'Pagada' : 'Pendiente',
  })) as Factura[],
  vacaciones: Array.from({ length: 2_000 }, (_, i) => ({
    id: i, empleado: `Emp ${i}`, tipo: 'Vacaciones', inicio: '2026-07-01', fin: '2026-07-10', dias: 9, estado: i % 4 === 0 ? 'Pendiente' : 'Aprobada',
  })) as Vacacion[],
};

vi.mock('@/lib/data/use-collection', () => ({
  useCollection: (key: string) => ({
    items: (BIG as Record<string, unknown[]>)[key] ?? [],
    create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn(),
  }),
}));

describe('Carga — mosaico completo (6 widgets) con datasets grandes simultáneos', () => {
  it('monta los 6 widgets a la vez (27.000 registros combinados) en tiempo acotado', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15));
    const { WidgetGrid } = await import('@/components/panel/widget-grid');
    const modules = { ...emptyModules() };
    for (const w of DASHBOARD_WIDGETS) if (w.dependsOn) modules[w.dependsOn] = true;
    const seleccion = ['agenda', 'kpis-hoy', 'proximos-eventos', 'clientes-nuevos', 'ventas-hoy', 'facturacion-pendiente'] as const;

    const t0 = performance.now();
    const { container } = render(<WidgetGrid selected={[...seleccion]} modules={modules} />);
    await flush();
    const ms = performance.now() - t0;

    console.info(`[carga] mosaico 6 widgets / 27.000 registros → ${ms.toFixed(1)}ms`);
    expect(container.querySelectorAll('.widget-tile')).toHaveLength(6);
    expect(ms).toBeLessThan(3000);
  });

  it('tiempos por widget individual bajo carga (medición desagregada)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15));
    const widgets = [
      ['AgendaWidget', '@/components/panel/widgets/agenda-widget', 'AgendaWidget'],
      ['KpisWidget', '@/components/panel/widgets/kpis-widget', 'KpisWidget'],
      ['ProximosWidget', '@/components/panel/widgets/proximos-widget', 'ProximosWidget'],
      ['ClientesNuevosWidget', '@/components/panel/widgets/clientes-nuevos-widget', 'ClientesNuevosWidget'],
      ['VentasHoyWidget', '@/components/panel/widgets/ventas-hoy-widget', 'VentasHoyWidget'],
      ['FacturacionWidget', '@/components/panel/widgets/facturacion-widget', 'FacturacionWidget'],
      ['VacacionesWidget', '@/components/panel/widgets/vacaciones-widget', 'VacacionesWidget'],
      ['OcupacionSemanaWidget', '@/components/panel/widgets/ocupacion-semana-widget', 'OcupacionSemanaWidget'],
    ] as const;

    const reporte: string[] = [];
    for (const [, modulePath, exportName] of widgets) {
      const mod = (await import(modulePath)) as Record<string, ComponentType>;
      const Comp = mod[exportName];
      const t0 = performance.now();
      render(<Comp />);
      await flush();
      const ms = performance.now() - t0;
      reporte.push(`${exportName}=${ms.toFixed(1)}ms`);
      cleanup();
      expect(ms).toBeLessThan(2000);
    }
    console.info(`[carga] desagregado: ${reporte.join(' · ')}`);
  });
});

// ---------------------------------------------------------------------------
// 3) Tiempos bajo interacción repetida (no solo carga estática): cambios de
//    vista y toggles repetidos no deben degradarse con el nº de repeticiones
//    (detecta acumulación de listeners/estado entre renders).
// ---------------------------------------------------------------------------
describe('Tiempos — interacción repetida', () => {
  it('100 cambios de vista en AgendaWidget: el tramo final no es más lento que el inicial', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15));
    const { AgendaWidget } = await import('@/components/panel/widgets/agenda-widget');
    render(<AgendaWidget />);
    await flush();

    const vistas = ['Mes', 'Semana', 'Día'] as const;
    const lapsos: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      fireEvent.click(screen.getByRole('button', { name: vistas[i % 3] }));
      lapsos.push(performance.now() - t0);
    }

    const primeros10 = lapsos.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const ultimos10 = lapsos.slice(-10).reduce((a, b) => a + b, 0) / 10;
    console.info(`[tiempos] 100 cambios de vista — primeros10=${primeros10.toFixed(2)}ms últimos10=${ultimos10.toFixed(2)}ms total=${lapsos.reduce((a, b) => a + b, 0).toFixed(1)}ms`);

    // Margen amplio (5x) para absorber ruido de GC/JIT sin ser flaky; el objetivo
    // es detectar una pendiente de degradación real, no microvariaciones.
    expect(ultimos10).toBeLessThan(Math.max(primeros10 * 5, 20));
  });

  it('60 toggles seguidos en DashboardWidgetsGrid no degradan el tiempo de click', async () => {
    const { DashboardWidgetsGrid } = await import('@/components/config/dashboard-widgets-grid');
    const modules = { ...emptyModules() };
    for (const w of DASHBOARD_WIDGETS) if (w.dependsOn) modules[w.dependsOn] = true;
    let selected: WidgetId[] = [];
    const onToggle = vi.fn((id: WidgetId, on: boolean) => {
      selected = on ? [...selected, id] : selected.filter((x) => x !== id);
    });
    const { rerender } = render(<DashboardWidgetsGrid selected={selected} modules={modules} onToggle={onToggle} />);

    const lapsos: number[] = [];
    for (let i = 0; i < 60; i++) {
      const id = DASHBOARD_WIDGETS[i % DASHBOARD_WIDGETS.length].id;
      const t0 = performance.now();
      const buttons = screen.getAllByRole('button');
      const idx = DASHBOARD_WIDGETS.findIndex((w) => w.id === id);
      fireEvent.click(buttons[idx]);
      rerender(<DashboardWidgetsGrid selected={selected} modules={modules} onToggle={onToggle} />);
      lapsos.push(performance.now() - t0);
    }

    const total = lapsos.reduce((a, b) => a + b, 0);
    console.info(`[tiempos] 60 toggles → total=${total.toFixed(1)}ms, media=${(total / 60).toFixed(2)}ms/click`);
    expect(total).toBeLessThan(3000);
  });
});
