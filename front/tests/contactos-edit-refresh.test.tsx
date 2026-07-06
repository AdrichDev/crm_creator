import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import Page from '@/app/(crm)/contactos/page';

// Regresión (bug: editar Contacto no persistía visualmente a la primera).
// handleSave ya hacía `await PATCH + await fetchApi()` correctamente; la causa real era
// que fetchApi NO descartaba respuestas fuera de orden: cada tecleo en los filtros
// dispara un GET (sin debounce) y un GET viejo aún en vuelo — con snapshot ANTERIOR al
// PATCH — podía resolver DESPUÉS del refetch post-guardado y pisar la fila recién
// editada. El fix añade la guardia fetchSeq (mismo patrón que usePaginatedApi.requestId).

type Row = Record<string, unknown> & { id: string; nombre: string };

let contactos: Row[] = [];
let deferNextGet = false;
let pendingGet: { resolve: (v: unknown) => void; snapshot: unknown } | null = null;

const apiFetchMock = vi.fn((path: string, init?: { method?: string; body?: string }) => {
  const method = init?.method ?? 'GET';
  if (method === 'PATCH' && path.startsWith('/contactos/')) {
    const id = path.split('/')[2].split('?')[0];
    const patch = JSON.parse(init!.body!) as Partial<Row>;
    contactos = contactos.map((c) => (c.id === id ? { ...c, ...patch } : c));
    return Promise.resolve({});
  }
  if (method === 'GET' && path.startsWith('/contactos')) {
    // Snapshot en el MOMENTO de la llamada (como el back real): un GET que quedó
    // en vuelo antes del PATCH lleva los datos viejos aunque resuelva después.
    const snapshot = { items: contactos.map((c) => ({ ...c })), total: contactos.length };
    if (deferNextGet) {
      deferNextGet = false;
      return new Promise((resolve) => { pendingGet = { resolve, snapshot }; });
    }
    return Promise.resolve(snapshot);
  }
  return Promise.resolve({ items: [], total: 0 });
});

vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => true,
  apiBaseUrl: () => 'http://test',
  apiFetch: (...a: unknown[]) => apiFetchMock(...(a as [string, { method?: string; body?: string }?])),
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: vi.fn().mockResolvedValue(undefined), confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/contactos',
}));

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  contactos = [{
    id: 'ct1', codigo: 'pc-01', tipo: 'lead', nombre: 'Marta Ibáñez', telefono: '600111222',
    email: 'marta@x.com', sector: 'Retail', direccion: 'Calle Mayor 1', peticion: null,
    contactado: 'no', createdAt: '2026-07-01T10:00:00.000Z',
  }];
  deferNextGet = false;
  pendingGet = null;
});
afterEach(() => { cleanup(); apiFetchMock.mockClear(); });

describe('contactos/page — editar persiste visualmente a la primera (modo API)', () => {
  it('tras guardar, la lista refleja el cambio inmediatamente', async () => {
    render(<Page />);
    await flush();
    expect(screen.getByText('Marta Ibáñez')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('Editar')[0]);
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Marta García' } });
    fireEvent.click(screen.getByText('Guardar cambios'));
    await flush();

    expect(screen.getByText('Marta García')).toBeInTheDocument();
    expect(screen.queryByText('Marta Ibáñez')).toBeNull();
  });

  it('un GET viejo en vuelo (disparado por un filtro antes de editar) NO pisa la edición guardada', async () => {
    render(<Page />);
    await flush();
    expect(screen.getByText('Marta Ibáñez')).toBeInTheDocument();

    // El usuario cambia la ordenación por cabecera → GET en vuelo con snapshot
    // PRE-edición que tarda en responder (red lenta / back frío).
    deferNextGet = true;
    fireEvent.click(screen.getByLabelText('Ordenar por Nombre'));
    await flush();
    expect(pendingGet).not.toBeNull();

    // Mientras tanto edita y guarda: PATCH + refetch post-guardado (resuelven al momento).
    fireEvent.click(screen.getAllByTitle('Editar')[0]);
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Marta García' } });
    fireEvent.click(screen.getByText('Guardar cambios'));
    await flush();
    expect(screen.getByText('Marta García')).toBeInTheDocument();

    // Ahora resuelve el GET viejo (datos pre-PATCH): debe DESCARTARSE, no pisar la lista.
    await act(async () => { pendingGet!.resolve(pendingGet!.snapshot); });
    await flush();

    expect(screen.getByText('Marta García')).toBeInTheDocument();
    expect(screen.queryByText('Marta Ibáñez')).toBeNull();
  });
});
