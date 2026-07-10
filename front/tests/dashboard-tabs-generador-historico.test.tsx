// crm-generator-versiones-historico (WU5.4, WU6.3, WU7.4): orden de pestañas
// Proyecto→Generados→Histórico→Exportar, regresión de las pestañas existentes,
// tabla de Generados y selector+LifecycleControl de Histórico.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: vi.fn(),
    isApiEnabled: () => true,
    apiBaseUrl: () => 'http://localhost:4000',
  };
});

const { setBusinessLifecycle, fetchBusinessStateEvents } = vi.hoisted(() => ({
  setBusinessLifecycle: vi.fn(),
  fetchBusinessStateEvents: vi.fn(),
}));
vi.mock('@/lib/api/operator', () => ({ setBusinessLifecycle, fetchBusinessStateEvents }));

import { apiFetch } from '@/lib/api/client';
import { DashboardTabs } from '@/components/dashboard/dashboard-tabs';
import { DialogProvider } from '@/components/ui/dialog-provider';
import { ExportJobProvider } from '@/lib/export/export-job-context';
import type { Project } from '@/lib/tenant-config-context';
import { DEFAULT_CONFIG } from '@/lib/config/tenant-config';

const mockApiFetch = vi.mocked(apiFetch);

function mkProject(id: string, name: string): Project {
  return {
    id,
    createdAt: new Date().toISOString(),
    config: {
      ...DEFAULT_CONFIG,
      business: { ...DEFAULT_CONFIG.business, name, vertical: 'otro', clienteId: null },
    },
  } as unknown as Project;
}

const versionsResponse = {
  versions: [
    { id: 'v-1', businessId: 'p1', businessName: 'Alpha', version: '1.0.0', changeNote: null, createdAt: '2026-06-01T10:00:00.000Z', lifecycle: 'ACTIVE', hasStateEvents: false },
    { id: 'v-2', businessId: 'p1', businessName: 'Alpha', version: '1.1.0', changeNote: 'fix', createdAt: '2026-06-02T10:00:00.000Z', lifecycle: 'ACTIVE', hasStateEvents: false },
    { id: 'v-3', businessId: 'p2', businessName: 'Beta', version: '1.0.0', changeNote: null, createdAt: '2026-06-03T10:00:00.000Z', lifecycle: 'SUSPENDED', hasStateEvents: true },
  ],
  distinctCount: 2,
};

function renderTabs(projects: Project[]) {
  return render(
    <DialogProvider>
      <ExportJobProvider>
        <DashboardTabs
          projects={projects}
          busy={null}
          onOpen={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onNew={vi.fn()}
        />
      </ExportJobProvider>
    </DialogProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('crm-generator-versiones-historico WU5 — orden de pestañas', () => {
  it('5.4 orden Proyecto→Generados→Histórico→Exportar; pestañas existentes siguen renderizando', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      if (path === '/exports/active') return undefined as never;
      if (path === '/exports/versions') return versionsResponse as never;
      return undefined as never;
    });
    fetchBusinessStateEvents.mockResolvedValue([]);

    renderTabs([mkProject('p1', 'Alpha')]);

    const tabButtons = screen.getAllByRole('button', { name: /Proyecto|Generados|Histórico|Exportar/ });
    const labels = tabButtons.map((b) => b.textContent);
    expect(labels).toEqual(['Proyecto', 'Generados', 'Histórico', 'Exportar']);

    // Pestaña Proyecto (dashboard) sigue mostrando el negocio existente.
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    // Pestaña Exportar sigue montando el flujo de export existente (tabla por código crm-XX).
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    await waitFor(() => expect(screen.getByText('crm-01')).toBeInTheDocument());
  });
});

describe('crm-generator-versiones-historico WU6 — tabla Generados', () => {
  it('6.3 3 filas para 2 negocios; sin hasStateEvents → "sin desplegar"; SUSPENDED se muestra; descargar no arranca job', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      if (path === '/exports/active') return undefined as never;
      if (path === '/exports/versions') return versionsResponse as never;
      if (path === '/exports/versions/v-1/download') return { url: 'https://signed.example/v-1.zip' } as never;
      return undefined as never;
    });
    fetchBusinessStateEvents.mockResolvedValue([]);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderTabs([mkProject('p1', 'Alpha'), mkProject('p2', 'Beta')]);
    fireEvent.click(screen.getByRole('button', { name: 'Generados' }));

    const rows = await screen.findAllByRole('row');
    // rows[0] es la cabecera.
    expect(rows.length).toBe(4);
    expect(within(rows[1]).getByText('sin desplegar')).toBeInTheDocument();
    expect(within(rows[3]).getByText('SUSPENDED')).toBeInTheDocument();

    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Descargar' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://signed.example/v-1.zip', '_blank', 'noopener,noreferrer'));

    // No se arrancó ningún job nuevo (nunca se hace POST /exports).
    expect(mockApiFetch.mock.calls.some((c) => c[0] === '/exports')).toBe(false);
    openSpy.mockRestore();
  });
});

describe('crm-generator-versiones-historico WU7 — Histórico', () => {
  it('7.4 seleccionar negocio B monta LifecycleControl con su businessId; sin eventos no rompe', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      if (path === '/exports/active') return undefined as never;
      if (path === '/exports/versions') return versionsResponse as never;
      return undefined as never;
    });
    fetchBusinessStateEvents.mockResolvedValue([]);

    renderTabs([mkProject('p1', 'Alpha'), mkProject('p2', 'Beta')]);
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));

    await waitFor(() => expect(fetchBusinessStateEvents).toHaveBeenCalledWith('p1'));

    fireEvent.change(screen.getByLabelText('Negocio'), { target: { value: 'p2' } });
    await waitFor(() => expect(fetchBusinessStateEvents).toHaveBeenCalledWith('p2'));

    // El componente reusado renderiza igual sin histórico (estado por defecto).
    expect(screen.getByText('Sin transiciones registradas.')).toBeInTheDocument();
  });
});
