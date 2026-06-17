import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateWithAI, AiBlockedError } from '@/lib/ai/usage-client';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => vi.restoreAllMocks());

describe('UC-6/7 · generación IA con tokens compartidos', () => {
  it('AC-6.2/6.3 devuelve contenido + uso de tokens', async () => {
    const fetchMock = mockFetch(200, { content: 'Plan...', usage: { tokens: 1234, model: 'gpt-5.4' } });
    vi.stubGlobal('fetch', fetchMock);

    const out = await generateWithAI({ kind: 'marketing-plan', clientId: 'c1', model: 'gpt-5.4', effort: 'medium', prompt: 'x' });

    expect(out.content).toContain('Plan');
    expect(out.usage?.tokens).toBe(1234);
    // Enviado al proxy con el payload correcto.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/generate');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ kind: 'marketing-plan', clientId: 'c1', model: 'gpt-5.4' });
  });

  it('AC-6.3 cliente sin cupo (402) → AiBlockedError', async () => {
    vi.stubGlobal('fetch', mockFetch(402, { error: 'Límite de uso del asistente excedido.' }));
    await expect(generateWithAI({ kind: 'market-study', model: 'gpt-5.4' })).rejects.toBeInstanceOf(AiBlockedError);
  });

  it('error genérico se propaga', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'boom' }));
    await expect(generateWithAI({ kind: 'market-study', model: 'gpt-5.4' })).rejects.toThrow(/boom/);
  });
});
