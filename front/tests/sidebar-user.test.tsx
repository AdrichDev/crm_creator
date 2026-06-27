import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

// --- Mocks de dependencias del Sidebar -------------------------------------
vi.mock('next/navigation', () => ({
  usePathname: () => '/panel',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockConfig = {
  business: { name: 'Negocio X', vertical: 'general' },
  branding: { logoImage: null, logoText: 'NX' },
  modules: {},
  terminology: {},
  moduleEmojis: {},
};
vi.mock('@/lib/tenant-config-context', () => ({
  useProjects: () => ({ config: mockConfig, closeProject: vi.fn() }),
  useRole: () => ({ role: 'admin' }),
}));

vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => true }));
// El usuario real es EMPLOYEE aunque el selector "Ver como" del contexto sea 'admin'.
vi.mock('@/lib/api/profile', () => ({
  getAuthProfile: () =>
    Promise.resolve({ id: '1', email: 'real@x.com', firstName: 'Carlos', lastName: 'Ruiz Pérez', phone: null, role: 'EMPLOYEE' }),
}));
vi.mock('@/lib/auth/session', () => ({ logout: vi.fn() }));
vi.mock('@/lib/config/generated-tenant', () => ({ GENERATED_TENANT: false }));

import { Sidebar } from '@/components/layout/sidebar';
import { memberRoleLabel } from '@/lib/config/roles';

afterEach(() => cleanup());

describe('UC · Sidebar pie con usuario real de sesión', () => {
  it('muestra el nombre real de la sesión (no el usuario demo)', async () => {
    render(<Sidebar />);
    // Usuario real de /auth/me, no el demo admin ('Administrador').
    expect(await screen.findByText('Carlos Ruiz Pérez')).toBeTruthy();
  });

  it('calcula iniciales con las 2 primeras palabras en mayúscula', async () => {
    render(<Sidebar />);
    expect(await screen.findByText('CR')).toBeTruthy();
  });

  it('rolLabel = rol REAL (EMPLOYEE→Empleado), no el selector "Ver como" (admin)', async () => {
    render(<Sidebar />);
    await screen.findByText('Carlos Ruiz Pérez');
    // Rol real EMPLOYEE → "Empleado". NO "Administrador" (que sería el del selector).
    expect(screen.getByText('Empleado')).toBeTruthy();
    expect(screen.queryByText('Administrador')).toBeNull();
  });
});

describe('UC · memberRoleLabel: EXACTAMENTE 4 roles (ADMIN/MANAGER/EMPLOYEE/CLIENT)', () => {
  it('los 4 roles tienen etiqueta propia y distinta', () => {
    expect(memberRoleLabel('ADMIN')).toBe('Administrador');
    expect(memberRoleLabel('MANAGER')).toBe('Manager');
    expect(memberRoleLabel('EMPLOYEE')).toBe('Empleado');
    expect(memberRoleLabel('CLIENT')).toBe('Cliente');
    const labels = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'CLIENT'].map(memberRoleLabel);
    expect(new Set(labels).size).toBe(4);
  });
  it('cualquier valor fuera del enum → Usuario', () => {
    expect(memberRoleLabel('OWNER')).toBe('Usuario');
    expect(memberRoleLabel('NOPE')).toBe('Usuario');
    expect(memberRoleLabel(null)).toBe('Usuario');
    expect(memberRoleLabel(undefined)).toBe('Usuario');
  });
});
