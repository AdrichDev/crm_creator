// model-catalog S8: relé server-side del catálogo de modelos del CRM hacia agents-agency.
// El selector del CRM deja de ser la fuente de verdad: GET /api/models pide el catálogo a
// AA con el MISMO token de servicio que ya usa /api/ai/generate, y solo un operador
// autenticado puede dispararlo. Sin red real: `fetch` global está mockeado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 'server-only' lanza al importarse fuera de un server component de Next.
vi.mock('server-only', () => ({}));

import { GET } from '@/app/api/models/route';

const SUPABASE_URL = 'https://proj.supabase.co';
const ANON_KEY = 'anon-key-123';
const AA_BASE = 'http://aa.test';
const SERVICE_TOKEN = 'service-token-abc';
const OPERATOR_TOKEN = 'operator-access-token';

// Forma EXACTA del contrato S7: sin precios y sin claves.
const AA_PAYLOAD = {
  providers: [
    {
      id: 'openai',
      name: 'OpenAI',
      models: [
        {
          id: 'gpt-5.6-luna',
          name: 'GPT-5.6 luna',
          provider: 'openai',
          reasoning: true,
          efforts: ['none', 'low', 'medium', 'high'],
          defaultEffort: 'low',
          contextWindow: 400000,
          verified: true,
        },
      ],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      models: [
        {
          id: 'deepseek-reasoner',
          name: 'DeepSeek reasoner',
          provider: 'deepseek',
          reasoning: true,
          efforts: ['low', 'medium', 'high'],
          defaultEffort: 'low',
          contextWindow: 131072,
          verified: true,
        },
      ],
    },
    {
      id: 'nanbuilders',
      name: 'nanBuilders',
      models: [
        {
          id: 'nan/auto',
          name: 'nanBuilders auto',
          provider: 'nanbuilders',
          reasoning: false,
          efforts: [],
          defaultEffort: null,
          contextWindow: 128000,
          verified: false,
        },
      ],
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const mockFetch = vi.fn();

/** Doble de red con router por URL: GoTrue (auth) + backend de agents-agency. */
function routeFetch(handlers: { user?: () => Response | Promise<Response>; aa?: (url: string, init?: RequestInit) => Response | Promise<Response> }) {
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const target = String(url);
    if (target.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      return handlers.user ? handlers.user() : jsonResponse({ id: 'u1', app_metadata: { role: 'operator' } });
    }
    if (target.startsWith(`${AA_BASE}/api/models`)) {
      if (!handlers.aa) throw new Error(`llamada inesperada a AA: ${target}`);
      return handlers.aa(target, init);
    }
    throw new Error(`URL no esperada en el test: ${target}`);
  });
}

function operatorRequest(withAuth = true): Request {
  return new Request('http://localhost:3002/api/models', {
    method: 'GET',
    headers: withAuth ? { authorization: `Bearer ${OPERATOR_TOKEN}` } : {},
  });
}

/** Llamadas al backend de AA (filtra las de GoTrue). */
function aaCalls(): Array<[string, RequestInit | undefined]> {
  return mockFetch.mock.calls
    .filter(([url]) => String(url).startsWith(AA_BASE))
    .map(([url, init]) => [String(url), init as RequestInit | undefined]);
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
  vi.stubEnv('AA_API_URL', AA_BASE);
  vi.stubEnv('AA_SERVICE_TOKEN', SERVICE_TOKEN);
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/models (relé del catálogo a agents-agency)', () => {
  it('reenvía el catálogo de AA con el token de servicio en el Authorization', async () => {
    routeFetch({ aa: () => jsonResponse(AA_PAYLOAD) });

    const res = await GET(operatorRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(AA_PAYLOAD);

    const calls = aaCalls();
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe(`${AA_BASE}/api/models`);
    expect(init?.method).toBe('GET');
    // El token del OPERADOR no viaja a AA: va el token de servicio del CRM.
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${SERVICE_TOKEN}` });
    expect(init?.cache).toBe('no-store');
  });

  it('sin token de operador responde 401 y NUNCA llama a AA', async () => {
    routeFetch({ aa: () => jsonResponse(AA_PAYLOAD) });

    const res = await GET(operatorRequest(false));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(aaCalls()).toHaveLength(0);
  });

  it('con sesión válida pero sin rol operator responde 401 y NUNCA llama a AA', async () => {
    routeFetch({
      user: () => jsonResponse({ id: 'u2', app_metadata: { role: 'admin' } }),
      aa: () => jsonResponse(AA_PAYLOAD),
    });

    const res = await GET(operatorRequest());

    expect(res.status).toBe(401);
    expect(aaCalls()).toHaveLength(0);
  });

  it('si AA falla (500) propaga el error y no devuelve una lista vacía como buena', async () => {
    routeFetch({ aa: () => jsonResponse({ error: 'internal' }, 500) });

    const res = await GET(operatorRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; providers?: unknown };
    expect(body.error).toBeTruthy();
    expect(body.providers).toBeUndefined();
  });

  it('si AA no responde (red/500 sin body) responde 502', async () => {
    routeFetch({
      aa: () => {
        throw new Error('ECONNREFUSED');
      },
    });

    const res = await GET(operatorRequest());

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});
