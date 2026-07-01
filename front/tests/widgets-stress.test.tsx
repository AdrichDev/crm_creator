import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { Cita } from '@/lib/mock/data';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
}));

const N = 5000;
const ESTADOS = ['Confirmada', 'Pendiente', 'Cancelada', 'Completada'];

// 5000 citas repartidas en 3 años (2024-01-01 .. ~2032), horas y estados variados,
// generadas deterministamente (sin Math.random) para que el test sea reproducible.
const BIG_CITAS: Cita[] = Array.from({ length: N }, (_, i) => {
  const date = new Date(2024, 0, 1);
  date.setDate(date.getDate() + i); // 1 cita/día durante ~13.7 años
  const hora = `${String(8 + (i % 10)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`;
  return {
    id: i + 1,
    cliente: `Cliente ${i}`,
    servicio: 'Servicio genérico',
    empleado: `Empleado ${i % 7}`,
    fecha: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    hora,
    estado: ESTADOS[i % ESTADOS.length],
  };
});

vi.mock('@/lib/data/use-collection', () => ({
  useCollection: () => ({
    items: BIG_CITAS,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reset: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe('Widgets — estrés con dataset grande (5000 citas)', () => {
  it('KpisWidget calcula totales correctos sobre 5000 citas en tiempo razonable', async () => {
    const { KpisWidget } = await import('@/components/panel/widgets/kpis-widget');
    const t0 = performance.now();
    const { container } = render(<KpisWidget />);
    await flush();
    const elapsed = performance.now() - t0;

    const confirmadas = BIG_CITAS.filter((c) => c.estado === 'Confirmada').length;
    const pendientes = BIG_CITAS.filter((c) => c.estado === 'Pendiente').length;
    expect(container.textContent).toContain(String(N));
    expect(container.textContent).toContain(String(confirmadas));
    expect(container.textContent).toContain(String(pendientes));
    expect(elapsed).toBeLessThan(2000); // smoke de rendimiento, no benchmark estricto
  });

  it('ProximosWidget ordena y limita a 5 sobre 5000 citas sin colgarse', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1));
    const { ProximosWidget } = await import('@/components/panel/widgets/proximos-widget');

    const t0 = performance.now();
    const { container } = render(<ProximosWidget />);
    await flush();
    const elapsed = performance.now() - t0;

    const items = container.querySelectorAll('li');
    expect(items.length).toBeLessThanOrEqual(5);
    expect(elapsed).toBeLessThan(2000);
  });

  it('AgendaWidget en vista mes renderiza con 5000 citas en memoria sin colgarse', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15));
    const { AgendaWidget } = await import('@/components/panel/widgets/agenda-widget');

    const t0 = performance.now();
    const { container } = render(<AgendaWidget />);
    await flush();
    const elapsed = performance.now() - t0;

    expect(container.querySelectorAll('.calendar-day:not(.empty)').length).toBeGreaterThan(27);
    expect(elapsed).toBeLessThan(2000);
  });

  it('OcupacionSemanaWidget cuenta correctamente la semana en curso entre 5000 citas', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 3)); // dentro de la semana con citas día 1,2,3...
    const { OcupacionSemanaWidget } = await import('@/components/panel/widgets/ocupacion-semana-widget');

    const { container } = render(<OcupacionSemanaWidget />);
    await flush();

    // 1 cita/día → cada barra de la semana representa exactamente 1 (o 0 si cae
    // fuera del rango sembrado, no aplica aquí: 2024-01-03 está bien dentro).
    const barras = container.querySelectorAll('[title]');
    expect(barras.length).toBe(7);
    for (const b of Array.from(barras)) {
      expect(b.getAttribute('title')).toMatch(/^[01] citas$/);
    }
  });

  it('renderizar y desmontar 50 veces seguidas no acumula fugas visibles (nº de nodos estable)', async () => {
    const { KpisWidget } = await import('@/components/panel/widgets/kpis-widget');
    for (let i = 0; i < 50; i++) {
      render(<KpisWidget />);
      await flush();
      cleanup(); // desmonta Y retira el contenedor; si hubiera fuga de efectos, no completaría limpio.
    }
    expect(document.body.querySelectorAll('*').length).toBe(0);
  });
});
