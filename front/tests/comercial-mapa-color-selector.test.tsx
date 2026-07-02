import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { MapaColorSelector } from '@/components/comercial/mapa-color-selector';

afterEach(() => cleanup());

const ESTADOS = [
  { id: 's1', nombre: 'Pendiente de visitar', color: '#ef4444', icono: 'MapPin', esPendiente: true },
  { id: 's2', nombre: 'Visitado', color: '#22c55e', icono: 'CircleCheck', esPendiente: false },
];

describe('MapaColorSelector — selector exclusivo + leyenda dinámica (WU1.2, AC1/AC2)', () => {
  it('modo estado: leyenda muestra los estados de visita, no la categoría ABC', () => {
    render(<MapaColorSelector modo="estado" onModoChange={vi.fn()} estados={ESTADOS} />);
    expect(screen.getByText('Pendiente de visitar')).toBeInTheDocument();
    expect(screen.getByText('Visitado')).toBeInTheDocument();
    expect(screen.queryByText(/Cliente A/)).toBeNull();
  });

  it('modo gasto: leyenda muestra A/B/C, no los estados de visita', () => {
    render(<MapaColorSelector modo="gasto" onModoChange={vi.fn()} estados={ESTADOS} />);
    expect(screen.getByText(/Cliente A/)).toBeInTheDocument();
    expect(screen.getByText(/Cliente B/)).toBeInTheDocument();
    expect(screen.getByText(/Cliente C/)).toBeInTheDocument();
    expect(screen.queryByText('Pendiente de visitar')).toBeNull();
  });

  it('nunca conviven las dos semánticas (AC1)', () => {
    render(<MapaColorSelector modo="estado" onModoChange={vi.fn()} estados={ESTADOS} />);
    expect(screen.queryByText(/Cliente A/)).toBeNull();
  });

  it('clicar "Categoría (gasto)" dispara onModoChange("gasto")', () => {
    const onModoChange = vi.fn();
    render(<MapaColorSelector modo="estado" onModoChange={onModoChange} estados={ESTADOS} />);
    fireEvent.click(screen.getByText('Categoría (gasto)'));
    expect(onModoChange).toHaveBeenCalledWith('gasto');
  });

  it('clicar "Estado de visita" dispara onModoChange("estado")', () => {
    const onModoChange = vi.fn();
    render(<MapaColorSelector modo="gasto" onModoChange={onModoChange} estados={ESTADOS} />);
    fireEvent.click(screen.getByText('Estado de visita'));
    expect(onModoChange).toHaveBeenCalledWith('estado');
  });
});
