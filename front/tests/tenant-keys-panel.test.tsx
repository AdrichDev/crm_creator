// Panel de claves/secretos por-tenant (crm-onboarding-tenant-keys) — render de slots,
// guardar limpia el input, probar ok/error (AI+database+maps, todos vía testSecret desde
// crm-onboarding-db-keys-export-connect T1), quitar con confirmación, valor tecleado
// nunca queda en el DOM tras guardar.
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

import { TenantKeysPanel, suggestMailHosts } from '@/components/config/tenant-keys-panel';
import { KNOWN_PRESET_NAMES } from '@/lib/api/tenant-keys';

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('KNOWN_PRESET_NAMES [crm-onboarding-db-keys-export-connect T5]', () => {
  it('incluye los 2 slots Supabase', () => {
    expect(KNOWN_PRESET_NAMES).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(KNOWN_PRESET_NAMES).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});

describe('suggestMailHosts [crm-tenant-oauth-creds-and-mail-connector T2.4]', () => {
  it('Gmail/Outlook/Hotmail/Live → null (van por OAuth, no IMAP/SMTP)', () => {
    expect(suggestMailHosts('user@gmail.com')).toBeNull();
    expect(suggestMailHosts('user@googlemail.com')).toBeNull();
    expect(suggestMailHosts('user@outlook.com')).toBeNull();
    expect(suggestMailHosts('user@hotmail.com')).toBeNull();
    expect(suggestMailHosts('user@live.com')).toBeNull();
  });

  it('dominio Hostinger conocido → host/puerto exactos', () => {
    expect(suggestMailHosts('negocio@hostinger.com')).toEqual({
      providerLabel: 'Hostinger', imapHost: 'imap.hostinger.com', imapPort: 993, smtpHost: 'smtp.hostinger.com', smtpPort: 465,
    });
  });

  it('dominio Zoho e IONOS conocidos → host/puerto exactos', () => {
    expect(suggestMailHosts('negocio@zoho.com')).toEqual({
      providerLabel: 'Zoho Mail', imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 465,
    });
    expect(suggestMailHosts('negocio@ionos.es')).toEqual({
      providerLabel: 'IONOS', imapHost: 'imap.ionos.com', imapPort: 993, smtpHost: 'smtp.ionos.com', smtpPort: 465,
    });
  });

  it('dominio propio no reconocido → fallback genérico mail.<dominio> (patrón cPanel)', () => {
    expect(suggestMailHosts('negocio@midominio.com')).toEqual({
      providerLabel: 'cPanel / genérico', imapHost: 'mail.midominio.com', imapPort: 993, smtpHost: 'mail.midominio.com', smtpPort: 465,
    });
  });

  it('email inválido (sin @ o sin dominio con punto) → null', () => {
    expect(suggestMailHosts('no-es-un-email')).toBeNull();
    expect(suggestMailHosts('user@localhost')).toBeNull();
    expect(suggestMailHosts('user@')).toBeNull();
  });
});

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

  it('sin groups: renderiza las 7 tarjetas (5 + 2 Supabase), todas "no configurado"', async () => {
    render(<TenantKeysPanel businessId={BIZ} />);
    await flush();
    for (const label of ['OpenAI', 'Gemini', 'Anthropic', 'Google Maps', 'URL (BD)', 'Supabase URL', 'Supabase anon key']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('no configurado')).toHaveLength(7);
    expect(apiFetch).toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets`);
  });

  it('groups=["database"]: renderiza BD + los 2 slots Supabase, nada de AI/Maps', async () => {
    render(<TenantKeysPanel businessId={BIZ} groups={['database']} />);
    await flush();
    expect(screen.getByText('URL (BD)')).toBeInTheDocument();
    expect(screen.getByText('Supabase URL')).toBeInTheDocument();
    expect(screen.getByText('Supabase anon key')).toBeInTheDocument();
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

  it('configurado: campo lleno de puntos de longitud FIJA (no el valor), readOnly hasta el foco', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('OPENAI_API_KEY', true)] };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['ai']} />);
    await flush();

    const masked = screen.getByLabelText('OpenAI (guardado, oculto)') as HTMLInputElement;
    expect(masked.readOnly).toBe(true);
    // Longitud FIJA (20), no la real: el back nunca devuelve el valor ni su longitud.
    expect(masked.value).toBe('•'.repeat(20));
    expect(masked.value).not.toMatch(/sk-|OPENAI/i);

    // Al hacer foco se convierte en un input editable VACÍO para sustituir.
    fireEvent.focus(masked);
    await flush();
    const editable = screen.getByLabelText('Valor de OpenAI') as HTMLInputElement;
    expect(editable.readOnly).toBe(false);
    expect(editable.value).toBe('');
  });

  it('slot configurado: botón "Guardado" deshabilitado; al teclear una clave nueva pasa a "Guardar" habilitado', async () => {
    // group=maps tiene un único slot → aísla el botón sin colisión con otras tarjetas.
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('GOOGLE_MAPS_API_KEY', true)] };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['maps']} />);
    await flush();

    // Ya guardado y sin edición pendiente → "Guardado" deshabilitado.
    const guardado = screen.getByRole('button', { name: 'Guardado' });
    expect(guardado).toBeDisabled();

    // Teclear una clave nueva habilita el guardado y cambia el label a "Guardar".
    fireEvent.focus(screen.getByLabelText('Google Maps (guardado, oculto)'));
    await flush();
    fireEvent.change(screen.getByLabelText('Valor de Google Maps'), { target: { value: 'AIza-nueva' } });
    await flush();

    const guardar = screen.getByRole('button', { name: 'Guardar' });
    expect(guardar).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardado' })).toBeNull();
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
    // group=database ahora también incluye los 2 slots Supabase — DATABASE_URL es el primero.
    fireEvent.click(screen.getAllByText('Probar conexión')[0]);
    await flush();
    expect(screen.getByText('no se pudo conectar la base de datos')).toBeInTheDocument();
  });

  it('probar (maps) [fix code-review]: NO llama a testSecret (Maps es NEXT_PUBLIC, se valida por HTTP-referrer en el navegador, no server-side) — con el slot configurado muestra éxito sin red', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('GOOGLE_MAPS_API_KEY', true)] };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['maps']} />);
    await flush();
    fireEvent.click(screen.getByText('Probar conexión'));
    await flush();
    expect(apiFetch).not.toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets/GOOGLE_MAPS_API_KEY/test`, expect.anything());
    expect(apiFetch).not.toHaveBeenCalledWith('/tenant-config');
    expect(screen.getByText('Clave guardada; se aplicará en el front y en el export.')).toBeInTheDocument();
  });

  it('probar (maps): con edición pendiente sin guardar pide guardar primero, sin llamar a testSecret', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) return { secrets: [seed('GOOGLE_MAPS_API_KEY', true)] };
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['maps']} />);
    await flush();
    fireEvent.focus(screen.getByLabelText('Google Maps (guardado, oculto)'));
    fireEvent.change(screen.getByLabelText('Valor de Google Maps'), { target: { value: 'nueva-clave-sin-guardar' } });
    fireEvent.click(screen.getByText('Probar conexión'));
    await flush();
    expect(apiFetch).not.toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets/GOOGLE_MAPS_API_KEY/test`, expect.anything());
    expect(screen.getByText('Guarda la clave primero.')).toBeInTheDocument();
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

describe('TenantKeysPanel — Otras variables (crm-tenant-keys-freeform)', () => {
  beforeEach(() => {
    apiFetch.mockReset().mockResolvedValue(VACIO);
    confirmMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  it('showExtras=false oculta la sección "Otras variables" (evita duplicado con varios paneles)', async () => {
    render(<TenantKeysPanel businessId={BIZ} groups={['database']} showExtras={false} />);
    await flush();
    expect(screen.queryByText('Otras variables')).toBeNull();
    expect(screen.queryByLabelText('Nombre de la nueva variable')).toBeNull();
  });

  it('showExtras por defecto muestra "Otras variables"', async () => {
    render(<TenantKeysPanel businessId={BIZ} />);
    await flush();
    expect(screen.getByText('Otras variables')).toBeInTheDocument();
  });

  it('key inválida deja "Agregar" disabled', async () => {
    render(<TenantKeysPanel businessId={BIZ} />);
    await flush();
    const keyInput = screen.getByLabelText('Nombre de la nueva variable');
    const valueInput = screen.getByLabelText('Valor de la nueva variable');
    fireEvent.change(keyInput, { target: { value: 'stripe_key' } });
    fireEvent.change(valueInput, { target: { value: 'algo' } });
    await flush();
    expect(screen.getByText('Agregar')).toBeDisabled();
  });

  it('escribir NEXT_PUBLIC_FOO + value + Agregar llama upsertSecret y la fila pasa a persistida', async () => {
    let putBody = '';
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/tenant-keys/${BIZ}/secrets` && (!init || init.method === undefined)) {
        return { secrets: [] };
      }
      if (path === `/tenant-keys/${BIZ}/secrets/NEXT_PUBLIC_FOO` && init?.method === 'PUT') {
        putBody = init.body as string;
        return {
          name: 'NEXT_PUBLIC_FOO',
          label: 'NEXT_PUBLIC_FOO',
          scope: 'FRONTEND_PUBLIC',
          envVarName: 'NEXT_PUBLIC_FOO',
          configured: true,
          updatedAt: '2026-07-11T00:00:00.000Z',
        };
      }
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} />);
    await flush();

    fireEvent.change(screen.getByLabelText('Nombre de la nueva variable'), { target: { value: 'NEXT_PUBLIC_FOO' } });
    fireEvent.change(screen.getByLabelText('Valor de la nueva variable'), { target: { value: 'valor-libre' } });
    await flush();
    expect(screen.getByText('Agregar')).not.toBeDisabled();

    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/tenant-keys/${BIZ}/secrets/NEXT_PUBLIC_FOO` && init?.method === 'PUT') {
        putBody = init.body as string;
        return {
          name: 'NEXT_PUBLIC_FOO',
          label: 'NEXT_PUBLIC_FOO',
          scope: 'FRONTEND_PUBLIC',
          envVarName: 'NEXT_PUBLIC_FOO',
          configured: true,
          updatedAt: '2026-07-11T00:00:00.000Z',
        };
      }
      if (path === `/tenant-keys/${BIZ}/secrets`) {
        return {
          secrets: [
            {
              name: 'NEXT_PUBLIC_FOO',
              label: 'NEXT_PUBLIC_FOO',
              scope: 'FRONTEND_PUBLIC',
              envVarName: 'NEXT_PUBLIC_FOO',
              configured: true,
              updatedAt: '2026-07-11T00:00:00.000Z',
            },
          ],
        };
      }
      return undefined;
    });

    fireEvent.click(screen.getByText('Agregar'));
    await flush();

    expect(JSON.parse(putBody)).toEqual({ value: 'valor-libre' });
    expect(screen.getByText('NEXT_PUBLIC_FOO')).toBeInTheDocument();
    expect(screen.getByText('Pública')).toBeInTheDocument();
    expect((screen.getByLabelText('Nombre de la nueva variable') as HTMLInputElement).value).toBe('');
  });

  it('[crm-onboarding-db-keys-export-connect T5] slots Supabase configurados: campo dedicado en group database, NUNCA en "Otras variables"', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === `/tenant-keys/${BIZ}/secrets`) {
        return {
          secrets: [
            seed('NEXT_PUBLIC_SUPABASE_URL', true),
            seed('NEXT_PUBLIC_SUPABASE_ANON_KEY', true),
          ],
        };
      }
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} groups={['database']} />);
    await flush();
    // Aparecen como tarjetas dedicadas con su label del CATALOG, no con el nombre crudo.
    expect(screen.getByText('Supabase URL')).toBeInTheDocument();
    expect(screen.getByText('Supabase anon key')).toBeInTheDocument();
    // Si hubieran caído en "Otras variables" se verían con el nombre crudo de la variable.
    expect(screen.queryByText('NEXT_PUBLIC_SUPABASE_URL')).toBeNull();
    expect(screen.queryByText('NEXT_PUBLIC_SUPABASE_ANON_KEY')).toBeNull();
  });

  it('Quitar en una fila free-form existente llama deleteSecret', async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/tenant-keys/${BIZ}/secrets` && init?.method === undefined) {
        return {
          secrets: [
            {
              name: 'STRIPE_SECRET_KEY',
              label: 'STRIPE_SECRET_KEY',
              scope: 'BACKEND_SECRET',
              envVarName: null,
              configured: true,
              updatedAt: '2026-07-11T00:00:00.000Z',
            },
          ],
        };
      }
      if (path === `/tenant-keys/${BIZ}/secrets/STRIPE_SECRET_KEY` && init?.method === 'DELETE') {
        return { name: 'STRIPE_SECRET_KEY', configured: false };
      }
      return undefined;
    });
    render(<TenantKeysPanel businessId={BIZ} />);
    await flush();
    fireEvent.click(screen.getByText('Quitar'));
    await flush();
    expect(apiFetch).toHaveBeenCalledWith(`/tenant-keys/${BIZ}/secrets/STRIPE_SECRET_KEY`, { method: 'DELETE' });
  });
});
