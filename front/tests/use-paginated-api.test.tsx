import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
  isApiEnabled: () => true,
  apiBaseUrl: () => 'http://localhost:4000',
}));

import { apiFetch } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';

const mockApiFetch = vi.mocked(apiFetch);

const PAGE_1 = { items: [{ id: '1', nombre: 'Test' }], total: 25, page: 1, limit: 20 };

afterEach(() => {
  vi.clearAllMocks();
});

describe('UC · usePaginatedApi', () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue(PAGE_1);
  });

  it('empieza con loading=true y resuelve con los items', async () => {
    const { result } = renderHook(() => usePaginatedApi('/customers', 20));
    expect(result.current.loading).toBe(true);

    await act(async () => { /* let promises resolve */ });

    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual(PAGE_1.items);
    expect(result.current.total).toBe(25);
  });

  it('calcula totalPages correctamente', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 45, page: 1, limit: 20 });
    const { result } = renderHook(() => usePaginatedApi('/customers', 20));
    await act(async () => {});
    expect(result.current.totalPages).toBe(3); // ceil(45/20) = 3
  });

  it('resetea page a 1 al cambiar search', async () => {
    const { result } = renderHook(() => usePaginatedApi('/customers', 20));
    await act(async () => {});

    // Ir a página 3
    act(() => { result.current.setPage(3); });
    await act(async () => {});
    expect(result.current.page).toBe(3);

    // Cambiar search → debe resetear page a 1
    act(() => { result.current.setSearch('ana'); });
    await act(async () => {});
    expect(result.current.page).toBe(1);
    expect(result.current.search).toBe('ana');
  });

  it('loading es true durante el fetch', async () => {
    let resolvePromise!: (v: typeof PAGE_1) => void;
    mockApiFetch.mockImplementation(
      () => new Promise((r) => { resolvePromise = r as typeof resolvePromise; }),
    );

    const { result } = renderHook(() => usePaginatedApi('/customers', 20));
    expect(result.current.loading).toBe(true);

    await act(async () => { resolvePromise(PAGE_1); });
    expect(result.current.loading).toBe(false);
  });

  it('refresh vuelve a llamar a apiFetch', async () => {
    const { result } = renderHook(() => usePaginatedApi('/customers', 20));
    await act(async () => {});

    const callsBefore = mockApiFetch.mock.calls.length;

    act(() => { result.current.refresh(); });
    await act(async () => {});

    expect(mockApiFetch.mock.calls.length).toBe(callsBefore + 1);
  });

  it('enabled=false → no hace fetch', async () => {
    const { result } = renderHook(() => usePaginatedApi('/customers', 20, false));
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
