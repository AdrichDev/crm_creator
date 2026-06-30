'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  setPage: (p: number) => void;
  refresh: () => void;
}

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Hook genérico para listar recursos paginados desde el back.
 * - Llama a `apiFetch(path?page=X&limit=Y&search=Z)`.
 * - Al cambiar search, resetea page a 1 automáticamente.
 * - No persiste estado en URL ni localStorage.
 * - enabled=false: no hace fetch (modo generador sin API).
 */
export function usePaginatedApi<T>(path: string, limit = 20, enabled = true): PaginatedResult<T> {
  const [page, setPageState] = useState(1);
  const [search, setSearchState] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const doFetch = useCallback(async (p: number, s: string) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (s) params.set('search', s);
      const data = await apiFetch<PagedResponse<T>>(`${path}?${params.toString()}`);
      if (mounted.current) {
        setItems(data.items);
        setTotal(data.total);
      }
    } catch {
      if (mounted.current) {
        setItems([]);
        setTotal(0);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [path, limit, enabled]);

  useEffect(() => {
    void doFetch(page, search);
  }, [page, search, doFetch]);

  // Al cambiar search, resetea page a 1 (ambos updates se batchean en React 18+).
  const setSearch = useCallback((s: string) => {
    setSearchState(s);
    setPageState(1);
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const refresh = useCallback(() => {
    void doFetch(page, search);
  }, [doFetch, page, search]);

  const totalPages = Math.ceil(total / limit);

  return { items, total, page, totalPages, limit, loading, search, setSearch, setPage, refresh };
}
