'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackend, type WithId } from './backend';

export type { WithId };

/**
 * Colección CRUD con backend conmutable:
 *   - sin credenciales Supabase  -> localStorage (sembrado desde mock)
 *   - con credenciales Supabase  -> tablas del esquema `app`
 * Las pantallas NO cambian: solo se cambia el backend en lib/data/backend.ts
 * según las variables de entorno.
 */
export function useCollection<T extends WithId>(key: string, seed: T[]) {
  const backend = getBackend();
  // Remoto (Supabase) → arranca VACÍO (sin mock); refresh trae los datos reales.
  // Local (generador) → arranca con el seed mock.
  const [items, setItems] = useState<T[]>(backend.remote ? [] : seed);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const data = await backend.list<T>(key, seed);
    if (mounted.current) setItems(data);
  }, [backend, key, seed]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const afterMutation = useCallback(() => {
    if (backend.remote) void refresh();
  }, [backend.remote, refresh]);

  const create = useCallback((data: Omit<T, 'id'>) => {
    const item = { ...(data as object), id: Date.now() + Math.floor(Math.random() * 1000) } as T;
    setItems((prev) => [item, ...prev]);          // optimista
    void backend.create(key, item).then(afterMutation);
  }, [backend, key, afterMutation]);

  const update = useCallback((id: T['id'], patch: Partial<T>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    void backend.update(key, id, patch).then(afterMutation);
  }, [backend, key, afterMutation]);

  const remove = useCallback((id: T['id']) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    void backend.remove(key, id).then(afterMutation);
  }, [backend, key, afterMutation]);

  const reset = useCallback(() => setItems(seed), [seed]);

  return { items, create, update, remove, reset, refresh };
}
