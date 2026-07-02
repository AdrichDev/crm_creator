import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { ClienteInfoModal } from '@/components/crm/cliente-info-modal';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

afterEach(() => { cleanup(); apiFetchMock.mockReset(); });
async function flush() { await act(async () => { await Promise.resolve(); }); }

describe('ClienteInfoModal (crm-citas-ux-agenda WU6 / AC6)', () => {
  it('sin customerId no renderiza nada ni llama al fetch', () => {
    const { container } = render(<ClienteInfoModal customerId={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('con customerId hace fetch por id y muestra la ficha', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'c1', nombre: 'Ana Gómez', email: 'ana@mail.test', telefono: '600111222',
      direccion: 'Calle Falsa 1', localidad: 'Madrid', estado: 'Activo',
    });
    render(<ClienteInfoModal customerId="c1" onClose={vi.fn()} />);
    await flush();

    expect(apiFetchMock).toHaveBeenCalledWith('/customers/c1');
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('ana@mail.test')).toBeInTheDocument();
    expect(screen.getByText('Calle Falsa 1')).toBeInTheDocument();
  });

  it('si el fetch falla, muestra un mensaje de error', async () => {
    apiFetchMock.mockRejectedValue(new Error('No encontrado'));
    render(<ClienteInfoModal customerId="c-x" onClose={vi.fn()} />);
    await flush();
    expect(screen.getByText('No encontrado')).toBeInTheDocument();
  });
});
