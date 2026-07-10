// crm-generator-versiones-historico (WU4, tarea 4.3): diálogo de version/changeNote
// en ExportTable — solo aparece a partir del 2º export del proyecto (dato via
// GET /exports/versions).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: vi.fn(),
    isApiEnabled: () => true,
    apiBaseUrl: () => 'http://localhost:4000',
  };
});

import { apiFetch } from '@/lib/api/client';
import { ExportTable } from '@/components/dashboard/export-table';

const mockApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

const project = {
  id: 'p1',
  createdAt: new Date().toISOString(),
  config: { business: { name: 'Test', vertical: 'otro', clienteId: null } },
} as never;

describe('crm-generator-versiones-historico WU4 — diálogo de versión', () => {
  it('4.3 primer export (sin versiones previas): no aparece diálogo, onExport se llama directo', async () => {
    const onExport = vi.fn();
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      if (path === '/exports/versions') return { versions: [], distinctCount: 0 } as never;
      return undefined as never;
    });
    render(<ExportTable projects={[project]} codeMap={{ p1: 'crm-01' }} isRunning={false} onExport={onExport} />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/exports/versions'));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledWith('p1', ['web-zip'], null));
    expect(screen.queryByText(/Nueva versión/)).toBeNull();
  });

  it('4.3 2º export (con versión previa): diálogo aparece; cancelar NO exporta', async () => {
    const onExport = vi.fn();
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      if (path === '/exports/versions') {
        return {
          versions: [
            {
              id: 'v-1',
              businessId: 'p1',
              businessName: 'Test',
              version: '1.0.0',
              changeNote: null,
              createdAt: new Date().toISOString(),
              lifecycle: 'ACTIVE',
              hasStateEvents: false,
            },
          ],
          distinctCount: 1,
        } as never;
      }
      return undefined as never;
    });
    render(<ExportTable projects={[project]} codeMap={{ p1: 'crm-01' }} isRunning={false} onExport={onExport} />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/exports/versions'));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    expect(await screen.findByText(/Nueva versión/)).toBeInTheDocument();
    expect(onExport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(/Nueva versión/)).toBeNull();
    expect(onExport).not.toHaveBeenCalled();
  });

  it('4.3 2º export: version invalida muestra error y NO llama a onExport', async () => {
    const onExport = vi.fn();
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      if (path === '/exports/versions') {
        return {
          versions: [
            {
              id: 'v-1',
              businessId: 'p1',
              businessName: 'Test',
              version: '1.0.0',
              changeNote: null,
              createdAt: new Date().toISOString(),
              lifecycle: 'ACTIVE',
              hasStateEvents: false,
            },
          ],
          distinctCount: 1,
        } as never;
      }
      return undefined as never;
    });
    render(<ExportTable projects={[project]} codeMap={{ p1: 'crm-01' }} isRunning={false} onExport={onExport} />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/exports/versions'));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    await screen.findByText(/Nueva versión/);

    fireEvent.change(screen.getByLabelText('Versión (x.y.z)'), { target: { value: 'v2' } });
    // El botón de confirmar dentro del diálogo también dice "Exportar" — hay dos en
    // pantalla mientras el diálogo está abierto (la tabla y el diálogo): el último
    // es el del diálogo.
    const buttons = screen.getAllByRole('button', { name: 'Exportar' });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByText(/Formato esperado/)).toBeInTheDocument();
    expect(onExport).not.toHaveBeenCalled();
  });

  it('4.3 2º export: version valida llama a onExport con version+changeNote', async () => {
    const onExport = vi.fn();
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/tenants') return [] as never;
      if (path === '/exports/versions') {
        return {
          versions: [
            {
              id: 'v-1',
              businessId: 'p1',
              businessName: 'Test',
              version: '1.0.0',
              changeNote: null,
              createdAt: new Date().toISOString(),
              lifecycle: 'ACTIVE',
              hasStateEvents: false,
            },
          ],
          distinctCount: 1,
        } as never;
      }
      return undefined as never;
    });
    render(<ExportTable projects={[project]} codeMap={{ p1: 'crm-01' }} isRunning={false} onExport={onExport} />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/exports/versions'));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    await screen.findByText(/Nueva versión/);

    fireEvent.change(screen.getByLabelText('Versión (x.y.z)'), { target: { value: '1.1.0' } });
    fireEvent.change(screen.getByLabelText('Notas del cambio (opcional)'), {
      target: { value: 'fix login' },
    });

    const buttons = screen.getAllByRole('button', { name: 'Exportar' });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(onExport).toHaveBeenCalledWith('p1', ['web-zip'], null, '1.1.0', 'fix login'));
  });
});
