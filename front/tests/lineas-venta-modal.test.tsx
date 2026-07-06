import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { LineasVentaModal } from '@/components/crm/lineas-venta-modal';

afterEach(() => { cleanup(); apiFetch.mockReset(); });
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('LineasVentaModal (3.2.g)', () => {
  it('lista líneas, añade una nueva vía POST y refresca el total', async () => {
    let created = false;
    apiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST') { created = true; return Promise.resolve({ id: 'l2' }); }
      // GET: antes de crear una línea; después, dos.
      const lineas = [{ id: 'l1', concepto: 'Corte', cantidad: 1, precioUnitario: 10, subtotal: 10 }];
      if (created) lineas.push({ id: 'l2', concepto: 'Tinte', cantidad: 2, precioUnitario: 15, subtotal: 30 });
      return Promise.resolve({ lineas });
    });

    const onChanged = vi.fn();
    render(<LineasVentaModal open saleId="s1" onClose={vi.fn()} onChanged={onChanged} />);
    await flush();

    expect(screen.getByText('Corte')).toBeInTheDocument();
    // 10.00 € aparece 2 veces: subtotal de la línea y TOTAL inicial.
    expect(screen.getAllByText('10.00 €')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Tinte' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Añadir'));
    await flush();

    const postCall = apiFetch.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(JSON.parse(postCall![1].body)).toMatchObject({ concepto: 'Tinte', cantidad: 2, precioUnitario: 15 });
    expect(screen.getByText('Tinte')).toBeInTheDocument();
    expect(screen.getByText('40.00 €')).toBeInTheDocument(); // total recalculado en la UI (10 + 30)
    expect(onChanged).toHaveBeenCalled();
  });
});
