import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import Page from '@/app/(crm)/clientes/page';

// Regresión (bug: editar Cliente no persistía visualmente a la primera).
// Causa: onSubmit delegaba en useCollection.update (PATCH fire-and-forget) y llamaba
// paged.refresh() en paralelo → el GET del paginado llegaba ANTES del commit del PATCH
// y la tabla recargaba datos viejos. El fix hace PATCH directo con await y refresca después.
// El fake de apiFetch modela ese orden real: el PATCH no commitea hasta que el test lo
// libera (releasePatch), y cada GET devuelve un snapshot del store EN EL MOMENTO de la llamada.

type Row = Record<string, unknown> & { id: string; nombre: string };

let customers: Row[] = [];
let patchRelease: (() => void) | null = null;

const apiFetchMock = vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
  const method = init?.method ?? 'GET';
  if (method === 'GET' && path.startsWith('/customers')) {
    const items = customers.map((c) => ({ ...c }));
    return { items, total: items.length, page: 1, limit: 20 };
  }
  if (method === 'PATCH' && path.startsWith('/customers/')) {
    const id = path.split('/')[2].split('?')[0];
    const patch = JSON.parse(init!.body!) as Partial<Row>;
    // Commit diferido: simula la latencia del back — el test decide cuándo commitea.
    await new Promise<void>((resolve) => { patchRelease = resolve; });
    customers = customers.map((c) => (c.id === id ? { ...c, ...patch } : c));
    return {};
  }
  return { items: [], total: 0 };
});

vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => true,
  apiBaseUrl: () => 'http://test',
  apiFetch: (...a: unknown[]) => apiFetchMock(...(a as [string, { method?: string; body?: string }?])),
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/lib/data/use-documents', () => ({
  useDocumentos: () => ({ docs: [], add: vi.fn(), remove: vi.fn() }),
}));

const alertMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: alertMock, confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
  useTenantConfig: () => ({ config: { business: { vertical: 'peluqueria' } } }),
}));

vi.mock('@/lib/config/sector-data', () => ({
  clientesMock: () => [],
  clienteExtraFields: () => [],
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/clientes',
}));

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  customers = [{
    id: 'cl1', nombre: 'Ana López', razonSocial: 'Peluquería Ana', email: 'ana@x.com',
    telefono: '600000001', direccion: 'Calle Sol 1', visitas: 3, gastoTotal: 120,
    gastoPendiente: 0, ultimaVisita: '2026-07-01', segmento: 'Recurrente', estado: 'ACTIVE',
    latitud: null, longitud: null,
  }];
  patchRelease = null;
});
afterEach(() => { cleanup(); apiFetchMock.mockClear(); alertMock.mockClear(); });

describe('clientes/page — editar persiste visualmente a la primera (modo API)', () => {
  it('tras guardar, la tabla refleja el cambio sin necesitar una segunda acción', async () => {
    render(<Page />);
    await flush();
    expect(screen.getByText('Ana López')).toBeInTheDocument();

    // Abrir editar y cambiar el nombre.
    fireEvent.click(screen.getAllByTitle('Editar')[0]);
    const input = screen.getByDisplayValue('Ana López');
    fireEvent.change(input, { target: { value: 'Ana María López' } });
    fireEvent.click(screen.getByText('Guardar'));
    await flush();

    // El PATCH aún no ha commiteado en el back (latencia simulada): el fix debe
    // ESPERAR a que resuelva antes de refrescar — no debe haber GET pisando datos viejos.
    expect(patchRelease).not.toBeNull();
    await act(async () => { patchRelease!(); });
    await flush();

    // La fila visible refleja la edición inmediatamente (sin recargar ni segunda acción).
    expect(screen.getByText('Ana María López')).toBeInTheDocument();
    expect(screen.queryByText('Ana López')).toBeNull();
  });
});
