// crm-generator-versiones-historico (WU8.2): contador "generados" del header
// usa `distinctCount` del backend (proyectos DISTINTOS con ≥1 export), no el
// conteo local de `generatedAt`. Escenario spec dashboard-generados: 4 negocios
// con export, uno reexportado 2 veces (5 filas en total) → contador muestra 4.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { fetchExportVersions } = vi.hoisted(() => ({ fetchExportVersions: vi.fn() }));
vi.mock('@/lib/api/exports-history', () => ({ fetchExportVersions }));

vi.mock('@/components/dashboard/dashboard-tabs', () => ({
  DashboardTabs: () => <div data-testid="dashboard-tabs-stub" />,
}));

const { isAuthed, logout } = vi.hoisted(() => ({
  isAuthed: vi.fn().mockResolvedValue(true),
  logout: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ isAuthed, logout }));

vi.mock('@/lib/config/generated-tenant', () => ({ GENERATED_TENANT: null }));

const { useProjects } = vi.hoisted(() => ({
  useProjects: vi.fn(() => ({
    ready: true,
    // 5 proyectos locales con `generatedAt` (uno de ellos, p1, reexportado
    // 2 veces produce 2 filas de ExportVersion pero es 1 solo negocio distinto).
    projects: [
      { id: 'p1', generatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', generatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p3', generatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p4', generatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p5', generatedAt: '2026-01-01T00:00:00.000Z' },
    ],
    config: { branding: {} },
    openProject: vi.fn(),
    deleteProject: vi.fn(),
  })),
}));
vi.mock('@/lib/tenant-config-context', () => ({ useProjects }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import Consola from '@/app/dashboard/page';

afterEach(() => vi.clearAllMocks());

describe('crm-generator-versiones-historico WU8 — contador del header', () => {
  it('8.2 5 proyectos locales con generatedAt pero backend distinctCount=4 (uno reexportado) → contador muestra 4, no 5', async () => {
    fetchExportVersions.mockResolvedValue({ versions: [], distinctCount: 4 });

    render(<Consola />);

    // El contador local `projects.filter((p) => p.generatedAt).length` daría 5
    // (5 proyectos con generatedAt); el stat "generados" debe mostrar el
    // `distinctCount` del backend (4), no ese 5. La etiqueta "5 proyectos"
    // (total, no relacionado a exports) sí es legítima y coexiste.
    const generadosLabel = await screen.findByText('generados');
    await waitFor(() => expect(generadosLabel.previousElementSibling?.textContent).toBe('4'));
    expect(fetchExportVersions).toHaveBeenCalledTimes(1);
  });
});
