// model-catalog S8: capa de datos del selector de modelos del CRM.
// La lista sale del catálogo de agents-agency (relé /api/models); la lista estática de
// lib/config/models.ts queda SOLO como respaldo cuando el relé falla.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetAccessToken = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
}));

import { fetchModelCatalog, parseModelCatalog } from '@/lib/ai/model-catalog';
import { LLM_PROVIDERS } from '@/lib/config/models';

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
          efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
          defaultEffort: 'low',
          contextWindow: 400000,
          verified: true,
        },
        {
          id: 'gpt-5.4-nano',
          name: 'GPT-5.4 nano',
          provider: 'openai',
          reasoning: true,
          efforts: ['none', 'low'],
          defaultEffort: 'none',
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
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  mockGetAccessToken.mockResolvedValue('operator-token');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('parseModelCatalog (contrato S7 → forma del selector)', () => {
  it('mapea proveedores y modelos, usando `name` como etiqueta y conservando efforts', () => {
    const providers = parseModelCatalog(AA_PAYLOAD);

    expect(providers).not.toBeNull();
    expect(providers!.map((p) => p.id)).toEqual(['openai', 'deepseek', 'nanbuilders']);
    expect(providers!.map((p) => p.label)).toEqual(['OpenAI', 'DeepSeek', 'nanBuilders']);

    const openai = providers!.find((p) => p.id === 'openai')!;
    expect(openai.models.map((m) => m.id)).toEqual(['gpt-5.6-luna', 'gpt-5.4-nano']);
    expect(openai.models[0]).toMatchObject({
      id: 'gpt-5.6-luna',
      label: 'GPT-5.6 luna',
      efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
      defaultEffort: 'low',
    });
    // La forma del selector no arrastra precios ni claves (el contrato tampoco las trae).
    expect(Object.keys(openai.models[0])).not.toContain('cost');
  });

  it('un defaultEffort que no está entre los efforts del modelo se descarta (null)', () => {
    const providers = parseModelCatalog({
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          models: [{ id: 'x', name: 'X', efforts: ['low', 'high'], defaultEffort: 'xhigh' }],
        },
      ],
    });

    expect(providers![0].models[0].defaultEffort).toBeNull();
  });

  it('un modelo sin efforts no razona aunque el payload no lo declare', () => {
    const providers = parseModelCatalog({
      providers: [{ id: 'gemini', name: 'Gemini', models: [{ id: 'gemini-3-pro', name: 'Gemini 3 Pro' }] }],
    });

    expect(providers![0].models[0]).toMatchObject({ id: 'gemini-3-pro', efforts: [], reasoning: false });
  });

  it('descarta modelos sin id y proveedores sin id, sin tirar el resto del catálogo', () => {
    const providers = parseModelCatalog({
      providers: [
        { id: 'openai', name: 'OpenAI', models: [{ id: 'ok-1', name: 'OK 1' }, { name: 'sin id' }, null, { id: '' }] },
        { name: 'sin id de proveedor', models: [{ id: 'x', name: 'X' }] },
      ],
    });

    expect(providers).toHaveLength(1);
    expect(providers![0].models.map((m) => m.id)).toEqual(['ok-1']);
  });

  it('payload inválido (sin providers, basura o no-objeto) → null', () => {
    expect(parseModelCatalog(null)).toBeNull();
    expect(parseModelCatalog('{}')).toBeNull();
    expect(parseModelCatalog({})).toBeNull();
    expect(parseModelCatalog({ providers: 'nope' })).toBeNull();
    expect(parseModelCatalog({ providers: [] })).toBeNull();
    expect(parseModelCatalog({ providers: [{ id: 'openai', models: 'nope' }] })).toBeNull();
  });
});

describe('fetchModelCatalog (relé → selector, con respaldo estático)', () => {
  it('pide /api/models con el Bearer del operador y devuelve el catálogo de AA', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));

    const providers = await fetchModelCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/models');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer operator-token' });
    expect((init as RequestInit).cache).toBe('no-store');

    expect(providers.map((p) => p.id)).toEqual(['openai', 'deepseek', 'nanbuilders']);
  });

  it('sin sesión: no manda Authorization pero sigue pidiendo el catálogo', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));

    await fetchModelCatalog();

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers ?? {}).not.toHaveProperty('Authorization');
  });

  for (const [label, response] of [
    ['el relé responde 401', () => jsonResponse({ error: 'No autenticado' }, 401)],
    ['el relé responde 502', () => jsonResponse({ error: 'boom' }, 502)],
    ['el relé devuelve un body inválido', () => jsonResponse({ nope: true })],
    ['el relé devuelve una lista vacía', () => jsonResponse({ providers: [] })],
  ] as const) {
    it(`si ${label} → lista estática de respaldo`, async () => {
      fetchMock.mockResolvedValue(response());

      const providers = await fetchModelCatalog();

      expect(providers).toEqual(LLM_PROVIDERS);
      expect(providers.length).toBeGreaterThan(0);
    });
  }

  it('si el fetch rechaza (red caída) → lista estática de respaldo', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(fetchModelCatalog()).resolves.toEqual(LLM_PROVIDERS);
  });
});

describe('lista estática de respaldo (front/lib/config/models.ts)', () => {
  const allModels = LLM_PROVIDERS.flatMap((p) => p.models.map((m) => m.id));

  it('ya no contiene el id retirado gpt-4.1-nano ni otros ids muertos de la familia 4.x/4o', () => {
    expect(allModels).not.toContain('gpt-4.1-nano');
    expect(allModels.filter((id) => /^gpt-4(\.1|-o)/.test(id))).toEqual([]);
  });

  it('alineada con el catálogo de AA: gpt-5.6-luna, gpt-5.4-mini, gpt-5.4-nano, un Gemini 3.x y un Claude', () => {
    expect(allModels).toEqual(expect.arrayContaining(['gpt-5.6-luna', 'gpt-5.4-mini', 'gpt-5.4-nano']));
    expect(allModels.some((id) => id.startsWith('gemini-3'))).toBe(true);
    expect(allModels.some((id) => id.startsWith('claude'))).toBe(true);
  });

  it('incluye DeepSeek como proveedor de primera clase', () => {
    const deepseek = LLM_PROVIDERS.find((p) => p.id === 'deepseek');
    expect(deepseek).toBeDefined();
    expect(deepseek!.models.map((m) => m.id)).toContain('deepseek-reasoner');
  });

  it('todo modelo razonador declara efforts y un defaultEffort válido', () => {
    for (const model of LLM_PROVIDERS.flatMap((p) => p.models)) {
      if (model.efforts.length === 0) continue;
      expect(model.reasoning).toBe(true);
      expect(model.defaultEffort === null || model.efforts.includes(model.defaultEffort)).toBe(true);
    }
  });
});
