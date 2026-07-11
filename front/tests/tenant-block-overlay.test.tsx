// Component test del overlay de bloqueo acotado por negocio (crm-tenant-block-scoping,
// tarea 4.3). El overlay solo monta BlockedScreen cuando el negocio bloqueado ES el
// negocio activo; para cualquier otro negocio (o sin bloqueo) renderiza null — OperaOS
// nunca queda tapado por la suspensión de un negocio ajeno a la vista actual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

// Negocio activo mutable por test; la sesión real (Supabase) no participa.
const { sessionState } = vi.hoisted(() => ({ sessionState: { activeBusinessId: 'biz-A' as string | null } }));
vi.mock('@/lib/auth/session', () => ({
  getActiveBusinessId: () => sessionState.activeBusinessId,
}));

// BlockedScreen consulta /tenant-status (exento del gate); aquí no interesa la red.
vi.mock('@/lib/api/tenant-status', () => ({
  fetchTenantStatus: async () => null,
}));

import { TenantBlockOverlay } from '@/components/tenant/tenant-block-overlay';
import { setTenantBlocked, reconcileTenantBlock } from '@/lib/tenant/blocked-state';

beforeEach(() => {
  sessionState.activeBusinessId = 'biz-A';
  setTenantBlocked(null); // reset del store singleton entre casos
});
afterEach(() => cleanup());

describe('overlay de bloqueo acotado al negocio activo', () => {
  it('monta BlockedScreen cuando el negocio bloqueado === negocio activo', async () => {
    setTenantBlocked({ variant: 'suspended', businessId: 'biz-A' });
    render(<TenantBlockOverlay />);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Servicio suspendido')).toBeTruthy();
  });

  it('renderiza null cuando el bloqueo pertenece a OTRO negocio', () => {
    sessionState.activeBusinessId = 'biz-B';
    setTenantBlocked({ variant: 'suspended', businessId: 'biz-A' });
    render(<TenantBlockOverlay />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('sin bloqueo no renderiza nada', () => {
    render(<TenantBlockOverlay />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('se desmonta sin recarga cuando la reconciliación limpia el bloqueo (cambio a negocio sano)', async () => {
    setTenantBlocked({ variant: 'suspended', businessId: 'biz-A' });
    render(<TenantBlockOverlay />);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();

    // Cambio de negocio activo: openProject fija la sesión y reconcilia el store.
    act(() => {
      sessionState.activeBusinessId = 'biz-B';
      reconcileTenantBlock('biz-B');
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
