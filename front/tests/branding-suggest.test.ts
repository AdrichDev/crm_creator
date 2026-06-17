import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseBrandingSuggestion, suggestBranding, AiBlockedError } from '@/lib/ai/usage-client';

afterEach(() => vi.restoreAllMocks());

describe('UC-3 · parseBrandingSuggestion', () => {
  it('extrae paleta hex y tipografía de un JSON limpio', () => {
    const s = parseBrandingSuggestion(JSON.stringify({
      palette: { primary: '#112233', secondary: '#445566', accent: '#778899' },
      typography: { heading: 'Poppins', body: 'Inter' },
      rationale: 'moderno',
    }));
    expect(s?.tokens.palette).toMatchObject({ primary: '#112233', secondary: '#445566', accent: '#778899' });
    expect(s?.tokens.typography).toMatchObject({ heading: 'Poppins', body: 'Inter' });
    expect(s?.rationale).toBe('moderno');
  });

  it('tolera JSON envuelto en texto / fences', () => {
    const s = parseBrandingSuggestion('Aquí tienes:\n```json\n{"palette":{"primary":"#abcdef"}}\n```');
    expect(s?.tokens.palette?.primary).toBe('#abcdef');
  });

  it('descarta colores que no son hex #RRGGBB', () => {
    const s = parseBrandingSuggestion(JSON.stringify({ palette: { primary: 'rojo', secondary: '#fff' } }));
    expect(s).toBeNull(); // ninguno válido → no aplicable
  });

  it('null si no hay nada aplicable', () => {
    expect(parseBrandingSuggestion('no json aquí')).toBeNull();
    expect(parseBrandingSuggestion('{}')).toBeNull();
  });

  it('acepta alias colors/fonts', () => {
    const s = parseBrandingSuggestion(JSON.stringify({ colors: { primary: '#010203' }, fonts: { body: 'Lato' } }));
    expect(s?.tokens.palette?.primary).toBe('#010203');
    expect(s?.tokens.typography?.body).toBe('Lato');
  });
});

describe('UC-3 · suggestBranding (proxy + metering)', () => {
  function mockFetch(status: number, body: unknown) {
    return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
  }

  it('manda kind branding-suggest al proxy y devuelve tokens', async () => {
    const fetchMock = mockFetch(200, { content: JSON.stringify({ palette: { primary: '#123456' } }), usage: { tokens: 42, model: 'gpt-5-mini' } });
    vi.stubGlobal('fetch', fetchMock);
    const out = await suggestBranding({ model: 'gpt-5-mini', business: { name: 'Salón A', vertical: 'peluqueria' } });
    expect(out.tokens.palette?.primary).toBe('#123456');
    expect(out.usage?.tokens).toBe(42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/generate');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ kind: 'branding-suggest' });
  });

  it('402 sin cupo → AiBlockedError', async () => {
    vi.stubGlobal('fetch', mockFetch(402, { error: 'sin cupo' }));
    await expect(suggestBranding({ model: 'm', business: { name: 'x', vertical: 'custom' } })).rejects.toBeInstanceOf(AiBlockedError);
  });

  it('respuesta inválida de IA → error', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { content: 'sin json' }));
    await expect(suggestBranding({ model: 'm', business: { name: 'x', vertical: 'custom' } })).rejects.toThrow(/no devolvió/);
  });
});
