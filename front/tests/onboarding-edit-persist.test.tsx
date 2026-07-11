import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import Onboarding from '@/app/onboarding/page';
import { configFromVertical } from '@/lib/config/tenant-config';

// UC-1 · "Guardar cambios" del onboarding en modo edición DEBE persistir en la BD
// (updateProject → PATCH /projects/:id) con el id del proyecto editado, y NO debe
// navegar como "guardado" si la escritura falla (muestra el error).

// Vertical DISTINTO de 'peluqueria' (el default de fábrica) a propósito: si el bug
// de sincronización reaparece, el draft se queda pegado en 'peluqueria' y este test
// lo detecta por diferencia, no por coincidencia.
const editingProject = {
  id: 'biz-1',
  config: configFromVertical('comerciales', 'Salón Editar'),
  createdAt: '2026-01-01T00:00:00.000Z',
};

const updateMock = vi.fn();
const pushMock = vi.fn();
const openMock = vi.fn();
const createMock = vi.fn();

// `projects` del contexto real arranca vacío y se hidrata async (ver
// tenant-config-context.tsx). Este mock lo modela con estado propio para poder
// simular esa carrera en el test de regresión de abajo: `projectsReadyAtMount`
// controla si `editing` ya está disponible en el PRIMER render del componente.
let projectsReadyAtMount = true;
let setProjectsReady: ((v: boolean) => void) | undefined;

vi.mock('@/lib/tenant-config-context', () => ({
  useProjects: () => {
    const [ready, setReady] = useState(projectsReadyAtMount);
    useEffect(() => { setProjectsReady = setReady; }, []);
    return {
      createProject: createMock,
      updateProject: updateMock,
      openProject: openMock,
      projects: ready ? [editingProject] : [],
    };
  },
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
// VerticalPicker SIN stub: el test de regresión de abajo necesita clicar una
// card real para probar el cambio de vertical en edición.
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
  projectsReadyAtMount = true;
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

  // Regresión del bug reportado en vivo: el draft se pegaba al preset de
  // 'peluqueria' cuando `projects` (contexto) cargaba DESPUÉS del primer
  // render, y "Guardar cambios" pisaba el vertical real del proyecto en BD.
  it('si projects carga DESPUÉS del primer render, el draft se resincroniza con la config real (no se queda en peluqueria)', async () => {
    projectsReadyAtMount = false;
    updateMock.mockResolvedValue(undefined);
    render(<Onboarding />);
    await flush();

    // `editing` sigue null en este punto: sin el fix, el draft ya quedó fijado
    // al preset vacío de 'peluqueria' en el useState lazy-init del mount.
    await act(async () => { setProjectsReady?.(true); });
    await flush();

    await gotoLastStep();
    await act(async () => { fireEvent.click(screen.getByText('Guardar cambios')); });
    await flush();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [id, cfg] = updateMock.mock.calls[0];
    expect(id).toBe('biz-1');
    expect(cfg.business.vertical).toBe('comerciales');
    expect(cfg.business.name).toBe('Salón Editar');
  });

  // Regresión del bug reportado en vivo: en edición el wizard arrancaba en
  // "Módulos" (paso 1) con minStep=1, así que "Atrás" quedaba deshabilitado y el
  // paso 0 (VerticalPicker) era inalcanzable — imposible cambiar el vertical de
  // un proyecto ya creado, ni siquiera para deshacer un guardado equivocado.
  it('en edición, "Atrás" permite volver a Tipo de negocio y cambiar el vertical', async () => {
    updateMock.mockResolvedValue(undefined);
    render(<Onboarding />);
    await flush();

    // Arranca en "Módulos" (paso 1); antes del fix "Atrás" estaba disabled aquí.
    const atras = screen.getByText('Atrás');
    expect(atras).not.toBeDisabled();
    fireEvent.click(atras);
    await flush();

    // Paso 0: cliente/nombre ocultos en edición, pero el picker de vertical sí.
    fireEvent.click(screen.getByText('Peluquería'));
    await flush();

    // Desde paso 0 (no 1 como en el resto de tests): 4 "Siguiente" hasta el final.
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText('Siguiente'));
      await flush();
    }
    await act(async () => { fireEvent.click(screen.getByText('Guardar cambios')); });
    await flush();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, cfg] = updateMock.mock.calls[0];
    expect(cfg.business.vertical).toBe('peluqueria');
  });
});
