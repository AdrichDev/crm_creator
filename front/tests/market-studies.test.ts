// Unit tests for lib/api/market-studies.ts — cliente del proxy CRM hacia AA.
// fetch y getAccessToken mockeados; sin red real ni proxy Next levantado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetAccessToken = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
}));

import {
  listStudies,
  getStudy,
  createStudy,
  generateStudy,
  patchStudy,
  patchProspectStatus,
} from '@/lib/api/market-studies';

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAccessToken.mockResolvedValue('token-123');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => vi.restoreAllMocks());

describe('listStudies', () => {
  it('hace GET a /api/market-studies con Bearer del operador', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse([{ id: '1' }]));

    await listStudies();

    expect(fetch).toHaveBeenCalledWith(
      '/api/market-studies',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        cache: 'no-store',
      }),
    );
  });

  it('devuelve la lista de estudios tal cual', async () => {
    const summaries = [{ id: '1', title: 'Zona centro', status: 'draft', createdAt: '2026-01-01' }];
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse(summaries));

    const result = await listStudies();

    expect(result).toEqual(summaries);
  });
});

describe('getStudy', () => {
  it('hace GET a /api/market-studies/:id', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse({ id: 'abc' }));

    await getStudy('abc');

    expect(fetch).toHaveBeenCalledWith('/api/market-studies/abc', expect.any(Object));
  });
});

describe('createStudy', () => {
  it('hace POST con el payload serializado', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse({ id: 'new' }));
    const payload = { title: 'Nuevo', inputs: { zone: 'Centro', radiusKm: 5, expansionZones: [], targetSectors: [] } };

    await createStudy(payload);

    expect(fetch).toHaveBeenCalledWith(
      '/api/market-studies',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    );
  });
});

describe('generateStudy', () => {
  it('hace POST a /:id/generate con el body por defecto', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse({ id: 'abc', status: 'ready' }));

    await generateStudy('abc');

    expect(fetch).toHaveBeenCalledWith(
      '/api/market-studies/abc/generate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    );
  });
});

describe('patchStudy / patchProspectStatus', () => {
  it('patchStudy hace PATCH a /:id con el parche', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse({ id: 'abc', successScore: 4 }));

    await patchStudy('abc', { successScore: 4 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/market-studies/abc',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ successScore: 4 }) }),
    );
  });

  it('patchProspectStatus hace PATCH a /:id/prospects/:placeId', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse({ ok: true, prospect: {} }));

    await patchProspectStatus('abc', 'place-1', 'contacted');

    expect(fetch).toHaveBeenCalledWith(
      '/api/market-studies/abc/prospects/place-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'contacted' }) }),
    );
  });
});

describe('manejo de errores', () => {
  it('rechaza con el mensaje de error del servidor cuando la respuesta no es ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse({ error: 'Sin cupo' }, 402));

    await expect(getStudy('abc')).rejects.toThrow('Sin cupo');
  });

  it('rechaza con "Error <status>" si el cuerpo de error no trae mensaje', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(jsonResponse({}, 500));

    await expect(getStudy('abc')).rejects.toThrow('Error 500');
  });
});
