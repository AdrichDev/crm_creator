import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import Page from '@/app/(crm)/fichaje/page';

// crm-operaos WU6 (AC6): fichaje con selector intensiva/partida y máquina de estados —
// bloquea saltos, repetidos y fichajes extra tras completar la jornada del día.
let apiEnabled = false;
const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  isApiEnabled: () => apiEnabled,
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/fichaje',
}));

async function flush() { await act(async () => { await Promise.resolve(); }); }

beforeEach(() => {
  apiEnabled = false;
  localStorage.clear();
  vi.setSystemTime(new Date(2026, 6, 5)); // 2026-07-05, fijo (evita flakiness al cruzar medianoche)
});
afterEach(() => { cleanup(); apiFetchMock.mockReset(); vi.useRealTimers(); });

describe('fichaje/page — modo local (demo, sin backend)', () => {
  it('jornada intensiva: entrada → salida → jornada completa, sin más fichajes', async () => {
    render(<Page />);
    await flush();

    expect(screen.getByText('No iniciada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fichar Entrada/ }));
    await flush();
    expect(screen.getByText('Último: Entrada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fichar Salida/ }));
    await flush();
    expect(screen.getByText('Jornada completa')).toBeInTheDocument();
    // Sin siguiente paso → no debe quedar ningún botón de fichar.
    expect(screen.queryByRole('button', { name: /Fichar/ })).toBeNull();
  });

  it('jornada partida: exige entrada, salida comida, vuelta comida y salida final en orden', async () => {
    render(<Page />);
    await flush();

    fireEvent.click(screen.getByLabelText('Jornada partida'));
    fireEvent.click(screen.getByRole('button', { name: /Fichar Entrada/ }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Fichar Salida a comer/ }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Fichar Vuelta de comer/ }));
    await flush();
    expect(screen.getByText('Hoy: Entrada → Salida a comer → Vuelta de comer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fichar Salida/ }));
    await flush();
    expect(screen.getByText('Jornada completa')).toBeInTheDocument();
  });

  it('bloquea el selector de modo en cuanto se ficha el primer paso del día', async () => {
    render(<Page />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Fichar Entrada/ }));
    await flush();

    expect(screen.getByLabelText('Jornada intensiva')).toBeDisabled();
    expect(screen.getByLabelText('Jornada partida')).toBeDisabled();
  });

  it('recuerda el modo elegido en localStorage entre sesiones', async () => {
    const { unmount } = render(<Page />);
    await flush();
    fireEvent.click(screen.getByLabelText('Jornada partida'));
    unmount();

    render(<Page />);
    await flush();
    expect(screen.getByLabelText('Jornada partida')).toBeChecked();
  });
});

describe('fichaje/page — modo remoto (API)', () => {
  beforeEach(() => { apiEnabled = true; });

  it('pide GET /fichaje/hoy y ficha vía POST /fichaje', async () => {
    let modo: string | null = null;
    let eventos: { paso: string }[] = [];
    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/fichaje/hoy') {
        const seq = ['entrada', 'salida_final'];
        const siguientePaso = eventos.length < seq.length ? seq[eventos.length] : null;
        return Promise.resolve({ modo, eventos, siguientePaso, jornadaCompleta: siguientePaso === null && modo !== null });
      }
      if (path === '/fichaje' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { modo: string };
        modo = body.modo;
        const paso = eventos.length === 0 ? 'entrada' : 'salida_final';
        eventos = [...eventos, { paso }];
        return Promise.resolve({ id: `ev-${eventos.length}`, paso, modo });
      }
      return Promise.resolve({ items: [] });
    });

    render(<Page />);
    await flush();

    expect(apiFetchMock).toHaveBeenCalledWith('/fichaje/hoy');
    fireEvent.click(screen.getByRole('button', { name: /Fichar Entrada/ }));
    await flush();

    expect(apiFetchMock).toHaveBeenCalledWith('/fichaje', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText('Último: Entrada')).toBeInTheDocument();
  });
});
