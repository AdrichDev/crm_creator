// Integraciones OAuth por negocio — render de estados y aviso oauth_no_configurado.
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
vi.mock('@/lib/api/client', () => ({ apiFetch, ApiError, isApiEnabled: () => true }));

const confirmMock = vi.fn();
vi.mock('@/components/ui/dialog-provider', () => ({
  useDialog: () => ({ confirm: confirmMock }),
}));

import { IntegracionesPanel, estadoLabel } from '@/components/config/integraciones-panel';

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const NUNCA = { items: [{ servicio: 'gmail', estado: null }, { servicio: 'calendar', estado: null }] };

describe('estadoLabel — mapeo estado → texto/tono', () => {
  it('cubre los cuatro estados', () => {
    expect(estadoLabel(null)).toEqual({ texto: 'Nunca conectada', tone: 'gray' });
    expect(estadoLabel('connected')).toEqual({ texto: 'Conectada', tone: 'green' });
    expect(estadoLabel('reauth_required')).toEqual({ texto: 'Requiere reconexión', tone: 'amber' });
    expect(estadoLabel('revoked')).toEqual({ texto: 'Desconectada', tone: 'red' });
  });
});

describe('IntegracionesPanel', () => {
  beforeEach(() => {
    apiFetch.mockReset().mockResolvedValue(NUNCA);
    confirmMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  it('nunca conectada: badge "Nunca conectada" y botón Conectar por servicio', async () => {
    render(<IntegracionesPanel />);
    await flush();
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getAllByText('Nunca conectada')).toHaveLength(2);
    expect(screen.getAllByText('Conectar')).toHaveLength(2);
    expect(screen.queryByText('Desconectar')).toBeNull();
  });

  it('conectada: badge "Conectada", fecha y botón Desconectar (sin Conectar)', async () => {
    apiFetch.mockResolvedValue({
      items: [
        { servicio: 'gmail', estado: null },
        { servicio: 'calendar', estado: 'connected', connectedAt: '2026-07-05T10:00:00.000Z', scopesOauth: [] },
      ],
    });
    render(<IntegracionesPanel />);
    await flush();
    expect(screen.getByText('Conectada')).toBeInTheDocument();
    expect(screen.getByText(/Última conexión: 2026-07-05 10:00/)).toBeInTheDocument();
    expect(screen.getByText('Desconectar')).toBeInTheDocument();
    // Gmail sigue sin conectar → un único botón Conectar.
    expect(screen.getAllByText('Conectar')).toHaveLength(1);
  });

  it('reauth_required: badge "Requiere reconexión" y botón Reconectar', async () => {
    apiFetch.mockResolvedValue({
      items: [
        { servicio: 'gmail', estado: null },
        { servicio: 'calendar', estado: 'reauth_required' },
      ],
    });
    render(<IntegracionesPanel />);
    await flush();
    expect(screen.getByText('Requiere reconexión')).toBeInTheDocument();
    expect(screen.getByText('Reconectar')).toBeInTheDocument();
  });

  it('connect con 503 oauth_no_configurado: aviso específico de GOOGLE_OAUTH_*', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/integrations') return NUNCA;
      throw new ApiError('Integración OAuth no configurada en el servidor', 503, 'oauth_no_configurado');
    });
    render(<IntegracionesPanel />);
    await flush();
    fireEvent.click(screen.getAllByText('Conectar')[0]);
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/GOOGLE_OAUTH_\*/);
    expect(apiFetch).toHaveBeenCalledWith('/integrations/calendar/connect', { method: 'POST' });
  });

  it('desconectar: pide confirmación y llama al revoke del servicio', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/integrations') {
        return { items: [{ servicio: 'gmail', estado: null }, { servicio: 'calendar', estado: 'connected' }] };
      }
      return undefined;
    });
    render(<IntegracionesPanel />);
    await flush();
    fireEvent.click(screen.getByText('Desconectar'));
    await flush();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/integrations/calendar/revoke', { method: 'POST' });
  });
});
