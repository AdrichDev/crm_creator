import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { useSettings } from '@/lib/data/use-settings';

afterEach(() => { apiFetch.mockReset(); });

describe('useSettings (3.2.i)', () => {
  it('carga datos con GET /settings/:categoria', async () => {
    apiFetch.mockResolvedValue({ categoria: 'general', datos: { horario: '9-18' } });
    const { result } = renderHook(() => useSettings('general'));
    await act(async () => {});

    expect(apiFetch).toHaveBeenCalledWith('/settings/general');
    expect(result.current.datos).toEqual({ horario: '9-18' });
    expect(result.current.loading).toBe(false);
  });

  it('save hace PUT con {datos} y actualiza el estado', async () => {
    apiFetch.mockResolvedValueOnce({ categoria: 'general', datos: {} });
    const { result } = renderHook(() => useSettings('general'));
    await act(async () => {});

    apiFetch.mockResolvedValueOnce({ categoria: 'general', datos: { aviso: true } });
    await act(async () => { await result.current.save({ aviso: true }); });

    const putCall = apiFetch.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall![0]).toBe('/settings/general');
    expect(JSON.parse(putCall![1].body)).toEqual({ datos: { aviso: true } });
    expect(result.current.datos).toEqual({ aviso: true });
  });
});
