import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

// Regresión fix 9.10: colapso del sidebar persistido en localStorage
// (paridad con agents-agency, misma clave 'sidebar-collapsed').
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

vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => false,
  apiFetch: vi.fn(),
}));
vi.mock('@/lib/api/profile', () => ({ getAuthProfile: () => Promise.reject(new Error('no api')) }));
vi.mock('@/lib/auth/session', () => ({ logout: vi.fn() }));
vi.mock('@/lib/config/generated-tenant', () => ({ GENERATED_TENANT: false }));

import { Sidebar } from '@/components/layout/sidebar';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('UC · Colapso del sidebar persistido (fix 9.10)', () => {
  it('arranca expandido por defecto: muestra el label de nav "Dashboard"', () => {
    render(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('al pulsar el botón de colapso, oculta los labels de nav y guarda el estado', () => {
    render(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Colapsar sidebar'));

    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
  });

  it('al volver a pulsar, se expande de nuevo y actualiza localStorage', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByTitle('Colapsar sidebar'));
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');

    fireEvent.click(screen.getByTitle('Expandir sidebar'));

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(localStorage.getItem('sidebar-collapsed')).toBe('false');
  });

  it('con sidebar-collapsed=true preseteado en localStorage, arranca colapsado', () => {
    localStorage.setItem('sidebar-collapsed', 'true');
    render(<Sidebar />);
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.getByTitle('Expandir sidebar')).toBeInTheDocument();
  });
});
