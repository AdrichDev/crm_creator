// Configuración → pestaña "Claves API" (crm-tenant-keys-self-service).
// La pestaña se gatea por el MemberRole CRUDO de GET /auth/me (getAuthProfile), NO por el
// `Role` colapsado de useRole() (que funde MANAGER y EMPLOYEE en 'trabajador'):
//   - ADMIN / MANAGER → pestaña visible; monta TenantKeysPanel con el businessId de sesión.
//   - EMPLOYEE / CLIENT / rol sin resolver (null) → pestaña oculta (fail-closed).
// El businessId que se pasa al panel es SIEMPRE el de la sesión activa (getActiveBusinessId),
// nunca input del usuario.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const { apiFetch, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    code?: string;
    status: number;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }
  return { apiFetch: vi.fn(), ApiError };
});
vi.mock('@/lib/api/client', () => ({ apiFetch, ApiError, isApiEnabled: () => true, apiBaseUrl: () => 'http://x' }));

// Rol CRUDO de sesión (getAuthProfile) — la variable la fija cada test.
const { getAuthProfileMock, getActiveBusinessIdMock } = vi.hoisted(() => ({
  getAuthProfileMock: vi.fn(),
  getActiveBusinessIdMock: vi.fn(),
}));
vi.mock('@/lib/api/profile', () => ({ getAuthProfile: getAuthProfileMock }));
// Mock del módulo de sesión completo para evitar cargar el cliente Supabase.
vi.mock('@/lib/auth/session', () => ({ getActiveBusinessId: getActiveBusinessIdMock }));

vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ alert: vi.fn(), confirm: vi.fn() }),
}));

// useRole() SIEMPRE devuelve el rol COLAPSADO 'trabajador' (donde MANAGER y EMPLOYEE se
// funden). Así el test prueba que el gate usa el rol crudo y no éste: MANAGER (crudo) ve la
// pestaña y EMPLOYEE (crudo) no, aunque ambos colapsen a 'trabajador'.
vi.mock('@/lib/tenant-config-context', () => ({
  useTenantConfig: () => ({
    config: { business: { name: 'Salón A', vertical: 'peluqueria' }, tenantEnabled: true, horario: undefined },
    update: vi.fn(), reset: vi.fn(),
    toggleModule: vi.fn(), setModuleEmoji: vi.fn(), toggleWorkerChip: vi.fn(), toggleDashboardWidget: vi.fn(),
  }),
  useRole: () => ({ role: 'trabajador' }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ConfiguracionPage from '@/app/(crm)/configuracion/page';

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const BIZ = 'biz-sesion-activa';

describe('ConfiguracionPage — pestaña "Claves API" gateada por MemberRole crudo', () => {
  beforeEach(() => {
    apiFetch.mockReset().mockResolvedValue({ secrets: [] });
    getActiveBusinessIdMock.mockReset().mockReturnValue(BIZ);
    getAuthProfileMock.mockReset();
  });
  afterEach(() => cleanup());

  async function renderConRol(role: string | null) {
    if (role === null) getAuthProfileMock.mockRejectedValue(new Error('sin sesión'));
    else getAuthProfileMock.mockResolvedValue({ id: 'u1', email: 'a@b.c', firstName: 'A', lastName: null, phone: null, role });
    render(<ConfiguracionPage />);
    await flush();
  }

  it('ADMIN: la pestaña "Claves API" es visible', async () => {
    await renderConRol('ADMIN');
    expect(screen.queryByRole('button', { name: 'Claves API' })).toBeInTheDocument();
  });

  it('MANAGER (colapsa a trabajador): la pestaña es visible — usa el rol crudo, no el colapsado', async () => {
    await renderConRol('MANAGER');
    expect(screen.queryByRole('button', { name: 'Claves API' })).toBeInTheDocument();
  });

  it('EMPLOYEE (también colapsa a trabajador): la pestaña está oculta', async () => {
    await renderConRol('EMPLOYEE');
    expect(screen.queryByRole('button', { name: 'Claves API' })).toBeNull();
  });

  it('CLIENT: la pestaña está oculta', async () => {
    await renderConRol('CLIENT');
    expect(screen.queryByRole('button', { name: 'Claves API' })).toBeNull();
  });

  it('rol sin resolver (getAuthProfile falla): fail-closed, la pestaña está oculta', async () => {
    await renderConRol(null);
    expect(screen.queryByRole('button', { name: 'Claves API' })).toBeNull();
  });

  it('MANAGER: al abrir la pestaña monta TenantKeysPanel con el businessId de la SESIÓN', async () => {
    await renderConRol('MANAGER');
    fireEvent.click(screen.getByRole('button', { name: 'Claves API' }));
    await flush();
    // El panel carga los slots contra el businessId de sesión (getActiveBusinessId), nunca input.
    expect(apiFetch).toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets`);
    // Renderiza las tarjetas del catálogo compartido.
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('URL (BD)')).toBeInTheDocument();
  });

  it('EMPLOYEE: aunque forzáramos el render, el contenido de claves no aparece (defensa en profundidad)', async () => {
    await renderConRol('EMPLOYEE');
    // Sin pestaña, no hay forma de navegar; el panel de claves no se monta.
    expect(screen.queryByText('URL (BD)')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets`);
  });
});
