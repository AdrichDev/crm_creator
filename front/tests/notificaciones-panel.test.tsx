import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { NotificacionesPanel } from '@/components/config/notificaciones-panel';

afterEach(() => { cleanup(); apiFetch.mockReset(); });
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('NotificacionesPanel (3.2.i)', () => {
  it('lista notificaciones y filtra por estado (añade ?estado a la query)', async () => {
    apiFetch.mockResolvedValue({
      items: [{ id: 'n1', tipo: 'recordatorio', canal: 'email', destino: 'ana@x.com', estado: 'sent', programadoEn: null, enviadoEn: '2026-07-02T09:00:00Z', createdAt: '2026-07-02T09:00:00Z' }],
      total: 1, page: 1, limit: 20,
    });

    render(<NotificacionesPanel />);
    await flush();

    expect(screen.getByText('recordatorio')).toBeInTheDocument();
    expect(apiFetch.mock.calls[0][0]).toContain('/notifications?');
    expect(apiFetch.mock.calls[0][0]).not.toContain('estado=');

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'sent' } });
    await flush();

    const filtered = apiFetch.mock.calls.some((c) => String(c[0]).includes('estado=sent'));
    expect(filtered).toBe(true);
  });
});
