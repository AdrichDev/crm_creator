import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock del cliente API conservando la clase real ApiError (usada con instanceof).
vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: vi.fn(),
    apiFetchBlob: vi.fn(),
    isApiEnabled: () => true,
    apiBaseUrl: () => 'http://localhost:4000',
  };
});

import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import { useExportJob } from '@/lib/export/use-export-job';
import { ExportJobProvider, useExportJobContext } from '@/lib/export/export-job-context';
import { ExportHeaderProgress } from '@/components/dashboard/export-header-progress';
import { ExportTable } from '@/components/dashboard/export-table';
import type { ExportJob } from '@/lib/export/types';

const mockApiFetch = vi.mocked(apiFetch);

function mkJob(over: Partial<ExportJob>): ExportJob {
  return {
    id: 'j1',
    projectId: 'p1',
    formats: ['web-zip'],
    status: 'running',
    pct: 0,
    perFormat: { 'web-zip': { status: 'running', pct: 0 } },
    createdAt: 0,
    ...over,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('Fase 2 · exportador polling', () => {
  // 2.1 — hook use-export-job
  it('2.1 start() hace POST, arranca polling y auto-descarga al recibir done', async () => {
    vi.useFakeTimers();
    // Sin handle (jsdom no soporta showSaveFilePicker) → descarga por anchor.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:x');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    // jsdom no implementa la navegación del anchor.click(); lo stubeamos.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(apiFetchBlob).mockResolvedValue(new Blob(['zip']));
    const running = mkJob({ status: 'running', pct: 40 });
    const done = mkJob({
      status: 'done',
      pct: 100,
      perFormat: { 'web-zip': { status: 'done', pct: 100, outputPath: '/out/test-web-src.zip' } },
    });
    let statusCall = 0;
    mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/exports' && init?.method === 'POST') return { jobId: 'j1' } as never;
      if (path === '/exports/j1/status') return (statusCall++ === 0 ? running : done) as never;
      return undefined as never;
    });

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start({ projectId: 'p1', formats: ['web-zip'] });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(mockApiFetch.mock.calls.filter((c) => c[0] === '/exports').length).toBe(1);
    expect(result.current.job?.status).toBe('running');
    expect(result.current.isRunning).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.job?.status).toBe('done');
    expect(result.current.isRunning).toBe(false);
    // Al terminar el job se dispara la descarga del ZIP (sin gesto adicional).
    expect(vi.mocked(apiFetchBlob)).toHaveBeenCalledWith('/exports/j1/download');
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();

    const before = mockApiFetch.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(mockApiFetch.mock.calls.length).toBe(before); // polling detenido
  });

  // 2.2 — reenganche vía GET /active al montar
  it('2.2 el contexto reengancha polling vía /active sin start()', async () => {
    vi.useFakeTimers();
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/exports/active') return mkJob({ id: 'j9', status: 'running', pct: 20 }) as never;
      if (path === '/exports/j9/status') return mkJob({ id: 'j9', status: 'running', pct: 55 }) as never;
      return undefined as never;
    });

    function Consumer() {
      const { job } = useExportJobContext();
      return <div data-testid="st">{job ? `${job.status}:${job.pct}` : 'none'}</div>;
    }

    render(<ExportJobProvider><Consumer /></ExportJobProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId('st').textContent).toContain('running');

    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByTestId('st').textContent).toContain('55');
    expect(mockApiFetch.mock.calls.some((c) => c[0] === '/exports/active')).toBe(true);
  });

  // 2.3 — barra header renderiza running / done / error
  it('2.3 ExportHeaderProgress renderiza running, done y error', async () => {
    vi.useFakeTimers();

    // running
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/exports/active') {
        return mkJob({ status: 'running', pct: 42, currentFormat: 'web-zip', step: 'Compilando' }) as never;
      }
      if (path === '/exports/j1/status') {
        return mkJob({ status: 'running', pct: 42, currentFormat: 'web-zip', step: 'Compilando' }) as never;
      }
      return undefined as never;
    });
    const r1 = render(<ExportJobProvider><ExportHeaderProgress /></ExportJobProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText(/Compilando/)).toBeInTheDocument();
    r1.unmount();

    // done → clic despliega ruta de salida
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/exports/active') {
        return mkJob({ status: 'done', pct: 100, perFormat: { 'web-zip': { status: 'done', pct: 100, outputPath: '/out/app.zip' } } }) as never;
      }
      return undefined as never;
    });
    const r2 = render(<ExportJobProvider><ExportHeaderProgress /></ExportJobProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Exportación completada')).toBeInTheDocument();
    // Flujo de un botón: la descarga es automática, NO hay botón "Descargar".
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
    fireEvent.click(screen.getByText('Exportación completada'));
    expect(screen.getByText('/out/app.zip')).toBeInTheDocument();
    r2.unmount();

    // error
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/exports/active') {
        return mkJob({ status: 'error', pct: 30, error: 'Fallo del build' }) as never;
      }
      return undefined as never;
    });
    render(<ExportJobProvider><ExportHeaderProgress /></ExportJobProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Exportación fallida')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Exportación fallida'));
    expect(screen.getByText('Fallo del build')).toBeInTheDocument();
  });

  // 2.4 — un botón: Exportar arranca el job (handle=null en jsdom, sin picker)
  it('2.4 Exportar llama onExport con (projectId, formats, handle) y no invoca pick-folder', async () => {
    const project = {
      id: 'p1',
      createdAt: new Date().toISOString(),
      config: { business: { name: 'Test', vertical: 'otro', clienteId: null } },
    } as never;

    const onExport = vi.fn();
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      return undefined as never;
    });
    render(
      <ExportTable projects={[project]} codeMap={{ p1: 'crm-01' }} isRunning={false} onExport={onExport} />,
    );
    // Selección de formato ahora es radio con 'web-zip' por defecto → basta con Exportar.
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    // jsdom no expone showSaveFilePicker → handle=null; el job arranca igual.
    await waitFor(() => expect(onExport).toHaveBeenCalledWith('p1', ['web-zip'], null));
    // Ya no se llama al endpoint inexistente pick-folder.
    expect(mockApiFetch.mock.calls.some((c) => c[0] === '/exports/pick-folder')).toBe(false);
  });
});
