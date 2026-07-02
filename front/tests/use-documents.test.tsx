import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { useDocumentos } from '@/lib/data/use-documents';

afterEach(() => { apiFetch.mockReset(); });

describe('useDocumentos (3.2.h)', () => {
  it('mapea Document del back a Documento (MIME y tamaño desde el data URL)', async () => {
    apiFetch.mockResolvedValue({
      items: [{ id: 'd1', titulo: 'Contrato', tipo: 'OTHER', rutaArchivo: 'data:image/png;base64,QUJD', createdAt: '2026-07-02T10:00:00Z' }],
    });

    const { result } = renderHook(() => useDocumentos(true));
    await act(async () => {});

    expect(apiFetch).toHaveBeenCalledWith('/documents?limit=100');
    const doc = result.current.docs[0];
    expect(doc).toMatchObject({ id: 'd1', nombre: 'Contrato', tipo: 'image/png', fecha: '2026-07-02' });
    expect(doc.tam).toBe(3); // "QUJD" (4 chars base64) ≈ 3 bytes
    expect(doc.datos).toBe('data:image/png;base64,QUJD');
  });

  it('add hace POST con tipo OTHER y refresca', async () => {
    apiFetch.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useDocumentos(true));
    await act(async () => {});

    await act(async () => {
      await result.current.add({ id: 9, nombre: 'foto.png', tipo: 'image/png', tam: 3, fecha: '2026-07-02', datos: 'data:image/png;base64,QUJD' });
    });

    const postCall = apiFetch.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(JSON.parse(postCall![1].body)).toMatchObject({ titulo: 'foto.png', rutaArchivo: 'data:image/png;base64,QUJD', tipo: 'OTHER' });
  });

  it('modo local (enabled=false) no llama al back', async () => {
    const { result } = renderHook(() => useDocumentos(false));
    await act(async () => {});
    await act(async () => { await result.current.add({ id: 1, nombre: 'x', tipo: 'archivo', tam: 0, fecha: '', datos: 'data:,' }); });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
