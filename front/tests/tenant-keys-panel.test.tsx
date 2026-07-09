// Panel de claves/secretos por-tenant (crm-onboarding-tenant-keys) — render de slots,
// guardar limpia el input, probar ok/error (AI+database), Maps vía /tenant-config,
// quitar con confirmación, valor tecleado nunca queda en el DOM tras guardar.
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

import { TenantKeysPanel } from '@/components/config/tenant-keys-panel';

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const BIZ = 'biz-123';
const VACIO = { secrets: [] };

function seed(name: string, configured: boolean) {
  return { name, configured, updatedAt: configured ? '2026-07-01T00:00:00.000Z' : null };
}

describe('TenantKeysPanel', () => {
  beforeEach(() => {
    apiFetch.mockReset().mockResolvedValue(VACIO);
    confirmMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  it('sin groups: renderiza las 5 tarjetas, todas "no configurado"', async () => {
    render(<TenantKeysPanel businessId={BIZ} />);
    await flush();
    for (const label of ['OpenAI', 'Gemini', 'Anthropic', 'Google Maps', 'URL (BD)']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('no configurado')).toHaveLength(5);
    expect(apiFetch).toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets`);
  });

  it('groups=["database"]: renderiza solo la tarjeta de BD', async () => {
    render(<TenantKeysPanel businessId={BIZ} groups={['database']} />);
    await flush();
    expect(screen.getByText('URL (BD)')).toBeInTheDocument();
    expect(screen.queryByText('OpenAI')).toBeNull();
    expect(screen.queryByText('Google Maps')).toBeNull();
  });

  it('groups=["ai","maps"]: renderiza las 3 de AI + Maps, sin BD', async () => {
    render(<TenantKeysPanel businessId={BIZ} groups={['ai', 'maps']} />);
    await flush();
    for (const label of ['OpenAI', 'Gemini', 'Anthropic', 'Google Maps']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('URL (BD)')).toBeNull();
  });

  it('configurado: badge "configurado" y botón Quitar visible', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('OPENAI_API_KEY', true)] };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['ai']} />);
    await flush();
    expect(screen.getByText('configurado')).toBeInTheDocument();
    expect(screen.getByText('Quitar')).toBeInTheDocument();
  });

  it('guardar: llama PUT con el valor tecleado, limpia el input tras guardar y el valor nunca queda en el DOM', async () => {
    let putBody = '';
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [] };
      if (path === `/tenant-keys/${BIZ}/secrets/OPENAI_API_KEY` && init?.method === 'PUT') {
        putBody = init.body as string;
        return { name: 'OPENAI_API_KEY', configured: true, updatedAt: '2026-07-01T00:00:00.000Z' };
      }
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['ai']} />);
    await flush();

    const input = screen.getByLabelText('Valor de OpenAI') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-secreto-de-prueba' } });
    fireEvent.click(screen.getAllByText('Guardar')[0]);
    await flush();

    expect(JSON.parse(putBody)).toEqual({ value: 'sk-secreto-de-prueba' });
    expect(input.value).toBe('');
    expect(document.body.textContent).not.toContain('sk-secreto-de-prueba');
  });

  it('probar (AI): resultado ok muestra mensaje de éxito', async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('OPENAI_API_KEY', true)] };
      if (path === `/tenant-keys/${BIZ}/secrets/OPENAI_API_KEY/test` && init?.method === 'POST') {
        return { ok: true, provider: 'openai' };
      }
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['ai']} />);
    await flush();
    fireEvent.click(screen.getAllByText('Probar conexión')[0]);
    await flush();
    expect(screen.getByText('Conexión correcta.')).toBeInTheDocument();
  });

  it('probar (database): resultado error muestra el detail del back', async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('DATABASE_URL', true)] };
      if (path === `/tenant-keys/${BIZ}/secrets/DATABASE_URL/test` && init?.method === 'POST') {
        return { ok: false, provider: 'database', detail: 'no se pudo conectar la base de datos' };
      }
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['database']} />);
    await flush();
    fireEvent.click(screen.getByText('Probar conexión'));
    await flush();
    expect(screen.getByText('no se pudo conectar la base de datos')).toBeInTheDocument();
  });

  it('probar (maps): usa GET /tenant-config, NO .../test — ok si publicEnvSecrets trae la clave', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('GOOGLE_MAPS_API_KEY', true)] };
      if (path === '/tenant-config') return { publicEnvSecrets: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'AIza-real' } };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['maps']} />);
    await flush();
    fireEvent.click(screen.getByText('Probar conexión'));
    await flush();
    expect(apiFetch).toHaveBeenCalledWith('/tenant-config');
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/test'), expect.anything());
    expect(screen.getByText('Clave activa en el runtime del front.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('AIza-real');
  });

  it('probar (maps) sin propagar: error', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('GOOGLE_MAPS_API_KEY', true)] };
      if (path === '/tenant-config') return { publicEnvSecrets: {} };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['maps']} />);
    await flush();
    fireEvent.click(screen.getByText('Probar conexión'));
    await flush();
    expect(screen.getByText('La clave aún no se refleja en el front. Guarda primero.')).toBeInTheDocument();
  });

  it('quitar: pide confirmación y llama DELETE', async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('OPENAI_API_KEY', true)] };
      if (path === `/tenant-keys/${BIZ}/secrets/OPENAI_API_KEY` && init?.method === 'DELETE') {
        return { name: 'OPENAI_API_KEY', configured: false };
      }
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['ai']} />);
    await flush();
    fireEvent.click(screen.getByText('Quitar'));
    await flush();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets/OPENAI_API_KEY`, { method: 'DELETE' });
  });

  it('quitar: si el usuario cancela la confirmación, no llama DELETE', async () => {
    confirmMock.mockResolvedValue(false);
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('OPENAI_API_KEY', true)] };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['ai']} />);
    await flush();
    fireEvent.click(screen.getByText('Quitar'));
    await flush();
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('secrets/OPENAI_API_KEY'), expect.objectContaining({ method: 'DELETE' }));
  });
});
