import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { SeguimientoPanel } from '@/components/comercial/seguimiento-panel';
import type { FollowUpItem } from '@/lib/comercial/follow-up';

afterEach(() => cleanup());

const ITEMS: FollowUpItem[] = [
  { id: 'reminder:r1', kind: 'reminder', reminderId: 'r1', urgency: 'vencido', fecha: '2026-06-30T09:00:00Z', customerId: 'c1', customerNombre: 'Cliente 1', titulo: 'Llamar' },
  { id: 'cliente:c2', kind: 'cliente-pendiente', urgency: 'pendiente', fecha: '2026-07-10T09:00:00Z', customerId: 'c2', customerNombre: 'Cliente 2', titulo: 'Próxima acción pendiente' },
];

describe('SeguimientoPanel — acciones inline (WU2.2, AC4)', () => {
  it('sin items: muestra el estado vacío', () => {
    render(<SeguimientoPanel items={[]} onCompletar={vi.fn()} onAbrirFicha={vi.fn()} getRouteUrl={() => null} />);
    expect(screen.getByText('Nada en seguimiento.')).toBeInTheDocument();
  });

  it('renderiza los items en el orden recibido con su cliente y título', () => {
    render(<SeguimientoPanel items={ITEMS} onCompletar={vi.fn()} onAbrirFicha={vi.fn()} getRouteUrl={() => null} />);
    expect(screen.getByText('Cliente 1')).toBeInTheDocument();
    expect(screen.getByText('Llamar')).toBeInTheDocument();
    expect(screen.getByText('Cliente 2')).toBeInTheDocument();
  });

  it('"Completar" solo aparece para items de tipo recordatorio, y llama a onCompletar con el reminderId', () => {
    const onCompletar = vi.fn();
    render(<SeguimientoPanel items={ITEMS} onCompletar={onCompletar} onAbrirFicha={vi.fn()} getRouteUrl={() => null} />);
    const botones = screen.getAllByText('Completar');
    expect(botones).toHaveLength(1); // solo el item 'reminder', no el 'cliente-pendiente'
    fireEvent.click(botones[0]);
    expect(onCompletar).toHaveBeenCalledWith('r1');
  });

  it('"Ficha" llama a onAbrirFicha con el customerId del item', () => {
    const onAbrirFicha = vi.fn();
    render(<SeguimientoPanel items={ITEMS} onCompletar={vi.fn()} onAbrirFicha={onAbrirFicha} getRouteUrl={() => null} />);
    fireEvent.click(screen.getAllByText('Ficha')[0]);
    expect(onAbrirFicha).toHaveBeenCalledWith('c1');
  });

  it('"Ir" solo se muestra cuando hay ruta disponible (getRouteUrl no-null)', () => {
    render(<SeguimientoPanel items={ITEMS} onCompletar={vi.fn()} onAbrirFicha={vi.fn()}
      getRouteUrl={(id) => (id === 'c1' ? 'https://maps.google.com/x' : null)} />);
    const links = screen.getAllByText('Ir');
    expect(links).toHaveLength(1);
    expect(links[0].closest('a')).toHaveAttribute('href', 'https://maps.google.com/x');
  });
});
