'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type Datos = Record<string, unknown>;

/**
 * Ajustes del negocio por categoría sobre /api/settings/:categoria (GET/PUT).
 *
 * NOTA: la config del panel (branding/módulos/terminología) YA persiste vía
 * /api/projects (tenant-config-context.setConfig), y la categoría `config` está
 * reservada en el back (PUT → 403). Este hook queda listo para ajustes NUEVOS
 * que hoy no se guardan; NO duplica la vía de /api/projects.
 */
export function useSettings(categoria: string) {
  const [datos, setDatos] = useState<Datos>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ categoria: string; datos: Datos }>(`/settings/${categoria}`);
      setDatos(r.datos ?? {});
    } catch { setDatos({}); }
    finally { setLoading(false); }
  }, [categoria]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (next: Datos) => {
    const r = await apiFetch<{ categoria: string; datos: Datos }>(`/settings/${categoria}`, {
      method: 'PUT',
      body: JSON.stringify({ datos: next }),
    });
    setDatos(r.datos ?? next);
  }, [categoria]);

  return { datos, save, loading, refresh };
}
