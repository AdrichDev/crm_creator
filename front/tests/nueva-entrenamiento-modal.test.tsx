import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { NuevaEntrenamientoModal } from '@/components/crm/nueva-entrenamiento-modal';

const created: Record<string, unknown>[] = [];

vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string, init?: RequestInit) => {
    if (path.startsWith('/categories')) return Promise.resolve({ items: [{ id: 't1', nombre: 'Alevín B' }] });
    if (path.startsWith('/resources')) return Promise.resolve({ items: [{ id: 'r1', nombre: 'Pista 2', tipo: 'COURT' }] });
    if (path.startsWith('/employees')) return Promise.resolve({ items: [{ id: 'e1', nombre: 'Entrenador X' }] });
    if (path.startsWith('/locations')) return Promise.resolve({ items: [{ id: 'l1' }] });
    if (path === '/services' && init?.method === 'POST') {
      created.push(JSON.parse(init.body as string));
      return Promise.resolve({ id: 'svc-nuevo' });
    }
    if (path.startsWith('/services')) return Promise.resolve({ items: [] }); // sin "Entrenamiento" creado aún
    if (path === '/bookings' && init?.method === 'POST') {
      created.push(JSON.parse(init.body as string));
      return Promise.resolve({ id: 'bk1' });
    }
    return Promise.resolve({ items: [] });
  },
}));

afterEach(() => { cleanup(); created.length = 0; });
async function flush() { await act(async () => { await Promise.resolve(); }); }

describe('NuevaEntrenamientoModal (spec C-S3)', () => {
  it('no muestra ningún campo "Cliente" ni "Actividad" (la actividad es siempre Entrenamiento, resuelta en segundo plano)', async () => {
    render(<NuevaEntrenamientoModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(screen.queryByText(/^Cliente/i)).toBeNull();
    expect(screen.queryByText(/^Actividad/i)).toBeNull();
  });

  it('muestra los selectores de equipo, campo y entrenador con sus opciones', async () => {
    render(<NuevaEntrenamientoModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(screen.getByText('Equipo *')).toBeInTheDocument();
    expect(screen.getByText('Campo')).toBeInTheDocument();
    expect(screen.getByText('Entrenador')).toBeInTheDocument();
    expect(await screen.findByText('Alevín B')).toBeInTheDocument();
    expect(screen.getByText('Pista 2')).toBeInTheDocument();
    expect(screen.getByText('Entrenador X')).toBeInTheDocument();
  });

  it('al crear sin servicio "Entrenamiento" previo, lo crea automáticamente y lo usa en el booking', async () => {
    const { container } = render(<NuevaEntrenamientoModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    const equipoSelect = screen.getByText('Equipo *').nextElementSibling as HTMLSelectElement;
    fireEvent.change(equipoSelect, { target: { value: 't1' } });
    const horaInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    fireEvent.change(horaInput, { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear entrenamiento/i }));
    await flush();
    await flush();

    const serviceCreate = created.find((b) => 'nombre' in b);
    expect(serviceCreate?.nombre).toBe('Entrenamiento');
    const bookingCreate = created.find((b) => 'teamId' in b);
    expect(bookingCreate?.serviceId).toBe('svc-nuevo');
    expect(bookingCreate?.teamId).toBe('t1');
    expect(bookingCreate).not.toHaveProperty('customerId');
  });

  it('cerrado no renderiza nada', () => {
    const { container } = render(<NuevaEntrenamientoModal open={false} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
