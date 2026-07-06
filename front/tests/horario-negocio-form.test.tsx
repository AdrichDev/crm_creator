import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { HorarioNegocioForm } from '@/components/config/horario-negocio-form';
import { type BusinessSchedule, scheduleToTramos } from '@/lib/config/schedule';

afterEach(() => cleanup());

// Wrapper controlado: el form es controlado (value/onChange), como en el onboarding.
function Harness({ initial, onChangeSpy }: { initial?: BusinessSchedule; onChangeSpy?: (s: BusinessSchedule) => void }) {
  const [value, setValue] = useState<BusinessSchedule | undefined>(initial);
  return (
    <HorarioNegocioForm value={value} onChange={(s) => { setValue(s); onChangeSpy?.(s); }} />
  );
}

describe('HorarioNegocioForm — horario del negocio en onboarding', () => {
  it('sin horario: muestra estado vacío y "Añadir grupo" crea el primer grupo L-V', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    expect(screen.getByText(/todos los días figuran como cerrados/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Añadir grupo de días'));
    const last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(last.groups[0].dias).toEqual([1, 2, 3, 4, 5]);
    // Modo continuo por defecto → 1 tramo con inputs type=time (teclado + ratón).
    expect(last.mode).toBe('continuo');
    const inicio = screen.getByLabelText('Inicio tramo 1 (grupo 1)') as HTMLInputElement;
    expect(inicio.type).toBe('time');
  });

  it('toggle a "Horario partido" añade segundo tramo; volver a continuo lo recorta', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    fireEvent.click(screen.getByText('Añadir grupo de días'));
    fireEvent.click(screen.getByRole('radio', { name: 'Horario partido' }));
    let last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(last.groups[0].tramos).toHaveLength(2);
    expect(screen.getByLabelText('Inicio tramo 2 (grupo 1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Horario continuo' }));
    last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(last.groups[0].tramos).toHaveLength(1);
  });

  it('editar un tramo con el input time actualiza el horario y su aplanado', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    fireEvent.click(screen.getByText('Añadir grupo de días'));
    fireEvent.change(screen.getByLabelText('Inicio tramo 1 (grupo 1)'), { target: { value: '10:30' } });
    const last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(last.groups[0].tramos[0].inicio).toBe('10:30');
    expect(scheduleToTramos(last)[0]).toEqual({ diaSemana: 1, inicio: '10:30', fin: last.groups[0].tramos[0].fin });
  });

  it('marcar un día en un segundo grupo lo quita del primero (exclusividad)', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    fireEvent.click(screen.getByText('Añadir grupo de días')); // grupo 1: L-V
    fireEvent.click(screen.getByText('Añadir grupo de días')); // grupo 2: vacío
    fireEvent.click(screen.getByLabelText('Viernes (grupo 2)'));
    const last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(last.groups[0].dias).toEqual([1, 2, 3, 4]); // viernes se fue del grupo 1
    expect(last.groups[1].dias).toEqual([5]);
  });

  it('un día desmarcado en todos los grupos queda cerrado (sin filas)', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    fireEvent.click(screen.getByText('Añadir grupo de días'));
    fireEvent.click(screen.getByLabelText('Lunes (grupo 1)')); // desmarca lunes
    const last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(scheduleToTramos(last).map((t) => t.diaSemana)).toEqual([2, 3, 4, 5]);
  });
});
