import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { MapaColorSelector } from '@/components/comercial/mapa-color-selector';
import type { ComponentProps } from 'react';

afterEach(() => cleanup());

const ESTADOS = [
  { id: 's1', nombre: 'Pendiente de visitar', color: '#ef4444', icono: 'MapPin', esPendiente: true },
  { id: 's2', nombre: 'Visitado', color: '#22c55e', icono: 'CircleCheck', esPendiente: false },
];

type Props = ComponentProps<typeof MapaColorSelector>;

function renderSelector(overrides: Partial<Props> = {}) {
  const props: Props = {
    modo: 'estado',
    onModoChange: vi.fn(),
    estados: ESTADOS,
    filtroEstadoId: '',
    filtroCategoria: '',
    onFiltroEstadoChange: vi.fn(),
    onFiltroCategoriaChange: vi.fn(),
    ...overrides,
  };
  render(<MapaColorSelector {...props} />);
  return props;
}

describe('MapaColorSelector — selector exclusivo + leyenda dinámica (WU1.2, AC1/AC2)', () => {
  it('modo estado: leyenda muestra los estados de visita, no la categoría ABC', () => {
    renderSelector({ modo: 'estado' });
    expect(screen.getByText('Pendiente de visitar')).toBeInTheDocument();
    expect(screen.getByText('Visitado')).toBeInTheDocument();
    expect(screen.queryByText(/Cliente A/)).toBeNull();
  });

  it('modo gasto: leyenda muestra A/B/C, no los estados de visita', () => {
    renderSelector({ modo: 'gasto' });
    expect(screen.getByText(/Cliente A/)).toBeInTheDocument();
    expect(screen.getByText(/Cliente B/)).toBeInTheDocument();
    expect(screen.getByText(/Cliente C/)).toBeInTheDocument();
    expect(screen.queryByText('Pendiente de visitar')).toBeNull();
  });

  it('nunca conviven las dos semánticas (AC1)', () => {
    renderSelector({ modo: 'estado' });
    expect(screen.queryByText(/Cliente A/)).toBeNull();
  });

  it('clicar "Categoría (gasto)" dispara onModoChange("gasto")', () => {
    const { onModoChange } = renderSelector({ modo: 'estado' });
    fireEvent.click(screen.getByText('Categoría (gasto)'));
    expect(onModoChange).toHaveBeenCalledWith('gasto');
  });

  it('clicar "Estado de visita" dispara onModoChange("estado")', () => {
    const { onModoChange } = renderSelector({ modo: 'gasto' });
    fireEvent.click(screen.getByText('Estado de visita'));
    expect(onModoChange).toHaveBeenCalledWith('estado');
  });
});

describe('MapaColorSelector — leyenda clicable con filtro toggle (crm-operaos 9.3)', () => {
  it('click en un estado de la leyenda aplica el filtro de ese estado', () => {
    const { onFiltroEstadoChange } = renderSelector({ modo: 'estado' });
    fireEvent.click(screen.getByText('Visitado'));
    expect(onFiltroEstadoChange).toHaveBeenCalledWith('s2');
  });

  it('segundo click en el estado ya activo quita el filtro (toggle)', () => {
    const { onFiltroEstadoChange } = renderSelector({ modo: 'estado', filtroEstadoId: 's2' });
    fireEvent.click(screen.getByText('Visitado'));
    expect(onFiltroEstadoChange).toHaveBeenCalledWith('');
  });

  it('con un estado activo, clicar otro reemplaza el filtro (single-select)', () => {
    const { onFiltroEstadoChange } = renderSelector({ modo: 'estado', filtroEstadoId: 's2' });
    fireEvent.click(screen.getByText('Pendiente de visitar'));
    expect(onFiltroEstadoChange).toHaveBeenCalledWith('s1');
  });

  it('modo gasto: click en una categoría aplica el filtro y el toggle lo quita', () => {
    const { onFiltroCategoriaChange } = renderSelector({ modo: 'gasto', filtroCategoria: '' });
    fireEvent.click(screen.getByText(/Cliente B/));
    expect(onFiltroCategoriaChange).toHaveBeenCalledWith('B');
    cleanup();
    const second = renderSelector({ modo: 'gasto', filtroCategoria: 'B' });
    fireEvent.click(screen.getByText(/Cliente B/));
    expect(second.onFiltroCategoriaChange).toHaveBeenCalledWith('');
  });

  it('el item activo de la leyenda se marca como seleccionado (aria-pressed)', () => {
    renderSelector({ modo: 'estado', filtroEstadoId: 's1' });
    expect(screen.getByText('Pendiente de visitar').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Visitado').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('MapaColorSelector — indicador verde en el selector de modo (crm-operaos 9.3)', () => {
  it('con filtro de estado activo, el botón "Estado de visita" se pinta en verde', () => {
    renderSelector({ modo: 'estado', filtroEstadoId: 's1' });
    expect(screen.getByText('Estado de visita').className).toContain('bg-emerald-600');
    expect(screen.getByText('Categoría (gasto)').className).not.toContain('bg-emerald-600');
  });

  it('con filtro de categoría activo, el botón "Categoría (gasto)" se pinta en verde', () => {
    renderSelector({ modo: 'estado', filtroCategoria: 'A' });
    expect(screen.getByText('Categoría (gasto)').className).toContain('bg-emerald-600');
    expect(screen.getByText('Estado de visita').className).not.toContain('bg-emerald-600');
  });

  it('sin filtros, ningún botón de modo está en verde (estilo normal)', () => {
    renderSelector({ modo: 'estado' });
    expect(screen.getByText('Estado de visita').className).not.toContain('bg-emerald-600');
    expect(screen.getByText('Categoría (gasto)').className).not.toContain('bg-emerald-600');
  });
});
