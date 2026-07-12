import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import Onboarding from '@/app/onboarding/page';
import { configFromVertical } from '@/lib/config/tenant-config';

// Guardado por-paso + stepper clicable (solo modo edición).
// - saveStep persiste el draft completo (updateProject) SIN navegar.
// - En alta (sin projectId) no hay botón "Guardar" por-paso.
// - El stepper es clicable en edición: salta directo a otro paso.

const editingProject = {
  id: 'biz-1',
  config: configFromVertical('comerciales', 'Salón Editar'),
  createdAt: '2026-01-01T00:00:00.000Z',
};

const updateMock = vi.fn();
const pushMock = vi.fn();
const openMock = vi.fn();
const createMock = vi.fn();

// projectId presente = edición; ausente = alta. Se conmuta por test.
let searchParams = 'projectId=biz-1';

vi.mock('@/lib/tenant-config-context', () => ({
  useProjects: () => ({
    createProject: createMock,
    updateProject: updateMock,
    openProject: openMock,
    projects: [editingProject],
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParams),
}));

vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));

vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => false,
  apiBaseUrl: () => null,
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

// Stubs de componentes de configuración (no son objeto de estos tests).
vi.mock('@/components/config/module-toggle-grid', () => ({ ModuleToggleGrid: () => <div /> }));
vi.mock('@/components/config/branding-form', () => ({ BrandingForm: () => <div /> }));
vi.mock('@/components/config/ai-branding-suggest', () => ({ AiBrandingSuggest: () => <div /> }));
vi.mock('@/components/config/client-combobox', () => ({ ClientCombobox: () => <div /> }));
vi.mock('@/components/config/vertical-picker', () => ({ VerticalPicker: () => <div /> }));

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  updateMock.mockReset();
  pushMock.mockReset();
  openMock.mockReset();
  searchParams = 'projectId=biz-1';
});
afterEach(() => cleanup());

describe('Onboarding · guardado por-paso + stepper clicable', () => {
  // T2 — el botón "Guardar" del paso persiste el draft completo y NO navega.
  it('en edición, "Guardar" del paso llama updateProject y no navega', async () => {
    updateMock.mockResolvedValue(undefined);
    render(<Onboarding />);
    await flush();

    // Arranca en "Módulos" (paso 1, no el último) → coexisten "Guardar" (ghost) y
    // "Siguiente". El submit final "Guardar cambios" solo existe en el último paso.
    await act(async () => { fireEvent.click(screen.getByText('Guardar')); });
    await flush();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [id, cfg] = updateMock.mock.calls[0];
    expect(id).toBe('biz-1');
    expect(cfg.business.name).toBe('Salón Editar');
    expect(pushMock).not.toHaveBeenCalled();      // se queda en el paso
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument();
  });

  // T3 — en alta (sin projectId) no hay guardado por-paso.
  it('en alta no se renderiza el botón "Guardar" por-paso', async () => {
    searchParams = '';
    render(<Onboarding />);
    await flush();

    expect(screen.queryByText('Guardar')).toBeNull();
    expect(screen.queryByText('Guardado ✓')).toBeNull();
  });

  // T4 — el stepper es clicable en edición: saltar a otro paso.
  it('en edición, click en un círculo del stepper salta a ese paso', async () => {
    render(<Onboarding />);
    await flush();

    // En "Módulos" (paso 1) el botón final es "Siguiente".
    expect(screen.queryByText('Guardar cambios')).toBeNull();

    // Círculo del último paso ("Datos", i=4) muestra "5". Click → salta al final,
    // donde el botón final pasa a ser "Guardar cambios".
    await act(async () => { fireEvent.click(screen.getByText('5')); });
    await flush();

    expect(screen.getByText('Guardar cambios')).toBeInTheDocument();
  });
});
