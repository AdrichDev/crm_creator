import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { NuevaCitaModal } from '@/components/crm/nueva-cita-modal';

vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => {
    if (path.startsWith('/customers')) return Promise.resolve({ items: [{ id: 'c1', nombre: 'Ana' }] });
    if (path.startsWith('/services')) return Promise.resolve({ items: [{ id: 's1', nombre: 'Corte' }] });
    if (path.startsWith('/employees')) return Promise.resolve({ items: [{ id: 'e1', nombre: 'Bea' }] });
    if (path.startsWith('/locations')) return Promise.resolve({ items: [{ id: 'l1' }] });
    return Promise.resolve({ items: [] });
  },
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
}));

afterEach(() => cleanup());
async function flush() { await act(async () => { await Promise.resolve(); }); }

// crm-modales-hover-unificados WU3 (AC4): NuevaCitaModal conserva su chasis propio,
// pero con borde theme-aware garantizado (.crm-modal-panel), nunca fundido con el backdrop.
describe('NuevaCitaModal — borde theme-aware (WU3)', () => {
  it('renderiza con borde de contraste garantizado (.crm-modal-panel)', async () => {
    const { container } = render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(container.querySelector('.crm-modal-panel')).toBeInTheDocument();
  });

  it('cerrado no renderiza nada', () => {
    const { container } = render(<NuevaCitaModal open={false} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
