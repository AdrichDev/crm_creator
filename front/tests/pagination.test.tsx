import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Pagination } from '@/components/ui/pagination';

afterEach(() => cleanup());

describe('UC · Pagination', () => {
  it('retorna null cuando totalPages <= 1 (totalPages=1)', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={5} limit={20} onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('retorna null cuando totalPages === 0', () => {
    const { container } = render(
      <Pagination page={1} totalPages={0} total={0} limit={20} onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra texto informativo cuando totalPages > 1', () => {
    render(<Pagination page={2} totalPages={5} total={50} limit={10} onChange={vi.fn()} />);
    expect(screen.getByText(/Página 2 de 5/)).toBeTruthy();
    expect(screen.getByText(/50 resultados/)).toBeTruthy();
  });

  it('botón Anterior deshabilitado en página 1', () => {
    render(<Pagination page={1} totalPages={3} total={30} limit={10} onChange={vi.fn()} />);
    expect(screen.getByText('Anterior')).toBeDisabled();
    expect(screen.getByText('Siguiente')).not.toBeDisabled();
  });

  it('botón Siguiente deshabilitado en última página', () => {
    render(<Pagination page={3} totalPages={3} total={30} limit={10} onChange={vi.fn()} />);
    expect(screen.getByText('Siguiente')).toBeDisabled();
    expect(screen.getByText('Anterior')).not.toBeDisabled();
  });

  it('ambos botones habilitados en página intermedia', () => {
    render(<Pagination page={2} totalPages={5} total={50} limit={10} onChange={vi.fn()} />);
    expect(screen.getByText('Anterior')).not.toBeDisabled();
    expect(screen.getByText('Siguiente')).not.toBeDisabled();
  });

  it('llama onChange(page-1) al hacer click en Anterior', () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} total={50} limit={10} onChange={onChange} />);
    screen.getByText('Anterior').click();
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('llama onChange(page+1) al hacer click en Siguiente', () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} total={50} limit={10} onChange={onChange} />);
    screen.getByText('Siguiente').click();
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
