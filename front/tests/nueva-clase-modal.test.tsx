import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { NuevaClaseModal } from '@/components/crm/nueva-clase-modal';

vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => {
    if (path.startsWith('/services')) return Promise.resolve({ items: [{ id: 'sv1', nombre: 'Spinning' }] });
    if (path.startsWith('/employees')) return Promise.resolve({ items: [{ id: 'e1', nombre: 'Instructor X' }] });
    if (path.startsWith('/resources')) return Promise.resolve({ items: [{ id: 'r1', nombre: 'Sala 1', tipo: 'ROOM', capacidad: 20 }] });
    if (path.startsWith('/locations')) return Promise.resolve({ items: [{ id: 'l1' }] });
    return Promise.resolve({ items: [] });
  },
}));

afterEach(() => cleanup());
async function flush() { await act(async () => { await Promise.resolve(); }); }

// Orden de render en el modal: Clase(0), Instructor(1), Sala(2), Día(3).
const SALA_SELECT_INDEX = 2;

describe('NuevaClaseModal (spec C-S6)', () => {
  it('no muestra aforo hasta elegir sala', async () => {
    render(<NuevaClaseModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(screen.queryByText(/Aforo:/)).toBeNull();
  });

  it('al elegir una sala, muestra su aforo de forma informativa (no bloquea el formulario)', async () => {
    render(<NuevaClaseModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[SALA_SELECT_INDEX], { target: { value: 'r1' } });
    expect(await screen.findByText(/Aforo: 20 personas/)).toBeInTheDocument();
  });
});
