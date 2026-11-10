// model-catalog S8: el selector de modelos del CRM se alimenta del catálogo de agents-agency
// (relé /api/models). Aquí se comprueba el render de esa lista, el respaldo estático cuando el
// relé falla, y que los efforts por modelo salen de los datos del catálogo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

const mockGetAccessToken = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
}));

import { ModelEffort } from '@/components/ai/model-effort';
import { LLM_PROVIDERS } from '@/lib/config/models';

const noop = () => {};

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
          efforts: ['none', 'low', 'high'],
          defaultEffort: 'low',
          contextWindow: 400000,
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
        {
          // model-catalog S4: DeepSeek va de la mano de NanBuilders; el catálogo de AA lo
          // sirve como modelo de NanBuilders, sin proveedor `deepseek` propio.
          id: 'nan/deepseek-v4-flash',
          name: 'DeepSeek V4 flash',
          provider: 'nanbuilders',
          reasoning: true,
          efforts: ['low', 'medium', 'high'],
          defaultEffort: 'medium',
          contextWindow: 131072,
          verified: true,
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

function selects(container: HTMLElement) {
  const [modelSel, effortSel] = Array.from(container.querySelectorAll('select'));
  return { modelSel, effortSel };
}

function optionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((o) => o.value);
}

function optgroupLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('optgroup')).map((g) => g.getAttribute('label') ?? '');
}

beforeEach(() => {
  mockGetAccessToken.mockResolvedValue('operator-token');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ModelEffort · catálogo desde agents-agency', () => {
  for (const variant of ['opera', 'config'] as const) {
    it(`variant='${variant}' pinta los proveedores y modelos del relé (incl. los DeepSeek de nanBuilders)`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));

      const { container } = render(
        <ModelEffort variant={variant} model="gpt-5.6-luna" effort="low" onModel={noop} onEffort={noop} />,
      );

      await waitFor(() => expect(optgroupLabels(container)).toEqual(['OpenAI', 'nanBuilders']));
      const { modelSel } = selects(container);
      expect(optionValues(modelSel)).toEqual(['gpt-5.6-luna', 'nan/auto', 'nan/deepseek-v4-flash']);
      // La etiqueta visible es la del catálogo (`name`), no el id.
      expect(Array.from(modelSel.querySelectorAll('option')).map((o) => o.textContent)).toContain('DeepSeek V4 flash');
    });
  }

  it('un modelo DeepSeek servido por nanBuilders se pinta bajo NanBuilders y no como proveedor propio', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));

    const { container } = render(
      <ModelEffort variant="opera" model="nan/deepseek-v4-flash" effort="medium" onModel={noop} onEffort={noop} />,
    );

    await waitFor(() => expect(optgroupLabels(container)).toEqual(['OpenAI', 'nanBuilders']));
    const option = Array.from(container.querySelectorAll('option')).find((o) => o.value === 'nan/deepseek-v4-flash');
    expect(option).toBeDefined();
    expect(option!.closest('optgroup')?.getAttribute('label')).toBe('nanBuilders');
    // S4: sin optgroup "DeepSeek" — DeepSeek nunca es un proveedor directo del selector.
    expect(container.querySelector('optgroup[label="DeepSeek"]')).toBeNull();
  });

  it('si el relé falla, el selector usa la lista estática de respaldo (sin gpt-4.1-nano)', async () => {
    fetchMock.mockRejectedValue(new Error('relay caído'));

    const { container } = render(
      <ModelEffort variant="opera" model="gpt-5.4" effort="medium" onModel={noop} onEffort={noop} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(optgroupLabels(container)).toEqual(LLM_PROVIDERS.map((p) => p.label)));
    expect(optionValues(selects(container).modelSel)).not.toContain('gpt-4.1-nano');
  });

  it('si el relé responde con error, tampoco se queda sin modelos: respaldo estático', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'No autenticado' }, 401));

    const { container } = render(
      <ModelEffort variant="config" model="gpt-5.4" effort="medium" onModel={noop} onEffort={noop} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(optgroupLabels(container)).toEqual(LLM_PROVIDERS.map((p) => p.label)));
  });

  it('los efforts del select salen de los datos del modelo, no de una tabla fija', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));

    const { container } = render(
      <ModelEffort variant="opera" model="gpt-5.6-luna" effort="low" onModel={noop} onEffort={noop} />,
    );

    await waitFor(() => expect(selects(container).effortSel.querySelectorAll('option')).toHaveLength(3));
    expect(optionValues(selects(container).effortSel)).toEqual(['none', 'low', 'high']);
  });

  it('el effort por defecto lo dicta el modelo: un effort que el modelo no acepta se corrige a su defaultEffort', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));
    const onEffort = vi.fn();

    render(<ModelEffort variant="opera" model="nan/deepseek-v4-flash" effort="xhigh" onModel={noop} onEffort={onEffort} />);

    // nan/deepseek-v4-flash (de nanBuilders) declara efforts [low, medium, high]: 'xhigh' no
    // aplica. El catálogo se carga en dos fases (respaldo estático → relé), así que el último
    // valor emitido es el defaultEffort del catálogo del relé y todos los emitidos son válidos
    // para el modelo.
    await waitFor(() => expect(onEffort).toHaveBeenLastCalledWith('medium'));
    for (const [emitted] of onEffort.mock.calls) {
      expect(['low', 'medium', 'high']).toContain(emitted);
    }
  });

  it('un effort válido del modelo NO se toca (no se emite corrección)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));
    const onEffort = vi.fn();

    render(<ModelEffort variant="opera" model="nan/deepseek-v4-flash" effort="high" onModel={noop} onEffort={onEffort} />);

    await waitFor(() => expect(optgroupLabels(document.body as unknown as HTMLElement)).toEqual(['OpenAI', 'nanBuilders']));
    expect(onEffort).not.toHaveBeenCalled();
  });

  it('un modelo no razonador del catálogo mantiene el select de effort deshabilitado', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AA_PAYLOAD));

    const { container } = render(
      <ModelEffort variant="opera" model="nan/auto" effort="none" onModel={noop} onEffort={noop} />,
    );

    await waitFor(() => expect(optgroupLabels(container)).toContain('nanBuilders'));
    expect(selects(container).effortSel.disabled).toBe(true);
  });
});
