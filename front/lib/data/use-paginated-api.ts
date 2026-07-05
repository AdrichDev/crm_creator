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
export function usePaginatedApi<T>(
  path: string,
  limit = 20,
  enabled = true,
  extraParams?: Record<string, string | undefined>,
): PaginatedResult<T> {
  const [page, setPageState] = useState(1);
  const [search, setSearchState] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  // Última petición disparada (no la última en RESOLVER): al cambiar `extraKey`
  // (rango de fechas) se resetea `page` a 1 en el mismo ciclo que el fetch con
  // el `page` viejo ya está en curso — dos fetches en vuelo, sin garantía de
  // orden de respuesta. Sin este contador, la respuesta del page viejo podría
  // resolver DESPUÉS y pisar los datos correctos del page 1 con datos vacíos.
  const requestId = useRef(0);
  // Clave estable de extraParams (ej. rango de fechas visible en el calendario):
  // cambia solo cuando el CONTENIDO cambia, no la identidad del objeto — evita
  // refetch en cada render si el padre pasa un literal nuevo con los mismos valores.
  const extraKey = extraParams ? JSON.stringify(extraParams) : '';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Al cambiar extraParams (ej. rango de fechas del calendario), resetea a página 1 —
  // si el usuario estaba en la página 3 y navega a un rango con menos resultados,
  // se quedaría en una página vacía/fuera de rango sin este reset.
  const prevExtraKey = useRef(extraKey);
  useEffect(() => {
    if (prevExtraKey.current !== extraKey) {
      prevExtraKey.current = extraKey;
      setPageState(1);
    }
  }, [extraKey]);

  const doFetch = useCallback(async (p: number, s: string) => {
    if (!enabled) return;
    const myRequestId = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (s) params.set('search', s);
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams)) if (v) params.set(k, v);
      }
      const data = await apiFetch<PagedResponse<T>>(`${path}?${params.toString()}`);
      // Descarta si otra petición más nueva ya se disparó mientras esta esperaba
      // (ej. reset de página a 1 tras cambiar el rango) — evita que una respuesta
      // vieja (posiblemente vacía en el rango nuevo) pise datos ya correctos.
      if (mounted.current && myRequestId === requestId.current) {
        setItems(data.items);
        setTotal(data.total);
      }
    } catch {
      if (mounted.current && myRequestId === requestId.current) {
        setItems([]);
        setTotal(0);
      }
    } finally {
      if (mounted.current && myRequestId === requestId.current) setLoading(false);
    }
    // extraKey (no extraParams) es la dependencia real: ver comentario arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, limit, enabled, extraKey]);

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
