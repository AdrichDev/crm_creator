import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import Onboarding from '@/app/onboarding/page';
import { configFromVertical } from '@/lib/config/tenant-config';

// UC-1 · "Guardar cambios" del onboarding en modo edición DEBE persistir en la BD
// (updateProject → PATCH /projects/:id) con el id del proyecto editado, y NO debe
// navegar como "guardado" si la escritura falla (muestra el error).

const editingProject = {
  id: 'biz-1',
  config: configFromVertical('peluqueria', 'Salón Editar'),
  createdAt: '2026-01-01T00:00:00.000Z',
};

const updateMock = vi.fn();
const pushMock = vi.fn();
const openMock = vi.fn();
const createMock = vi.fn();

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
  useSearchParams: () => new URLSearchParams('projectId=biz-1'),
}));

vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));

// Sin backend en el test: el efecto de carga de /tenants no se dispara.
vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => false,
  apiBaseUrl: () => null,
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

// Stubs de los componentes de configuración (no son el objeto de este test).
vi.mock('@/components/config/vertical-picker', () => ({ VerticalPicker: () => <div /> }));
vi.mock('@/components/config/module-toggle-grid', () => ({ ModuleToggleGrid: () => <div /> }));
vi.mock('@/components/config/branding-form', () => ({ BrandingForm: () => <div /> }));
vi.mock('@/components/config/ai-branding-suggest', () => ({ AiBrandingSuggest: () => <div /> }));
vi.mock('@/components/config/client-combobox', () => ({ ClientCombobox: () => <div /> }));

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

// En edición el wizard arranca en "Módulos" (paso 1); avanza hasta el último paso.
async function gotoLastStep() {
  for (let i = 0; i < 3; i++) {
    fireEvent.click(screen.getByText('Siguiente'));
    await flush();
  }
}

beforeEach(() => {
  updateMock.mockReset();
  pushMock.mockReset();
  openMock.mockReset();
});
afterEach(() => cleanup());

describe('UC-1 · onboarding edición · "Guardar cambios" persiste en BD', () => {
  it('llama a updateProject con el id del proyecto editado y navega al guardar OK', async () => {
    updateMock.mockResolvedValue(undefined);
    render(<Onboarding />);
    await flush();
    await gotoLastStep();

    await act(async () => { fireEvent.click(screen.getByText('Guardar cambios')); });
    await flush();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [id, cfg] = updateMock.mock.calls[0];
    expect(id).toBe('biz-1');
    expect(cfg.business.name).toBe('Salón Editar');
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('si la escritura en BD falla, muestra el error y NO navega', async () => {
    updateMock.mockRejectedValue(new Error('BD no disponible'));
    render(<Onboarding />);
    await flush();
    await gotoLastStep();

    await act(async () => { fireEvent.click(screen.getByText('Guardar cambios')); });
    await flush();

    expect(updateMock).toHaveBeenCalledWith('biz-1', expect.anything());
    expect(screen.getByText('BD no disponible')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
