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

describe('HorarioNegocioForm — horario del negocio (modo por grupo + aceptar)', () => {
  it('sin horario: muestra estado vacío y "Añadir grupo" crea el primer grupo L-V continuo', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    expect(screen.getByText(/todos los días figuran como cerrados/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Añadir grupo de días'));
    const last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(last.groups[0].dias).toEqual([1, 2, 3, 4, 5]);
    // Modo continuo por defecto POR GRUPO → 1 tramo con inputs type=time.
    expect(last.groups[0].mode).toBe('continuo');
    const inicio = screen.getByLabelText('Inicio tramo 1 (grupo 1)') as HTMLInputElement;
    expect(inicio.type).toBe('time');
  });

  it('el toggle continuo/partido es POR GRUPO y no afecta a otro grupo', () => {
    const spy = vi.fn();
    const initial: BusinessSchedule = {
      groups: [
        { mode: 'continuo', dias: [1, 2], tramos: [{ inicio: '09:00', fin: '17:00' }] },
        { mode: 'continuo', dias: [6], tramos: [{ inicio: '10:00', fin: '14:00' }] },
      ],
    };
    render(<Harness initial={initial} onChangeSpy={spy} />);
    // Poner el grupo 1 en partido.
    fireEvent.click(screen.getByRole('radio', { name: 'Horario partido (grupo 1)' }));
    const last = spy.mock.calls.at(-1)![0] as BusinessSchedule;
    expect(last.groups[0].mode).toBe('partido');
    expect(last.groups[0].tramos).toHaveLength(2);
    // El grupo 2 sigue intacto (continuo, 1 tramo).
    expect(last.groups[1].mode).toBe('continuo');
    expect(last.groups[1].tramos).toHaveLength(1);
    expect(screen.getByLabelText('Inicio tramo 2 (grupo 1)')).toBeInTheDocument();
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
    expect(last.groups[0].dias).toEqual([1, 2, 3, 4]);
    expect(last.groups[1].dias).toEqual([5]);
  });

  it('"Aceptar" colapsa el grupo a un resumen con "Editar" que lo reabre', () => {
    const spy = vi.fn();
    const initial: BusinessSchedule = {
      groups: [{ mode: 'continuo', dias: [1, 2, 3, 4, 5], tramos: [{ inicio: '09:00', fin: '17:00' }] }],
    };
    render(<Harness initial={initial} onChangeSpy={spy} />);
    // Editable: se ve el toggle de tipo.
    expect(screen.getByRole('radiogroup', { name: 'Tipo de horario (grupo 1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar grupo 1' }));
    // Colapsado: ya no hay toggle ni inputs, aparece resumen + "Editar".
    expect(screen.queryByRole('radiogroup', { name: 'Tipo de horario (grupo 1)' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Inicio tramo 1 (grupo 1)')).not.toBeInTheDocument();
    expect(screen.getByText(/09:00–17:00/)).toBeInTheDocument();
    const editBtn = screen.getByRole('button', { name: 'Editar grupo 1' });
    fireEvent.click(editBtn);
    // Reabierto: vuelve el toggle editable.
    expect(screen.getByRole('radiogroup', { name: 'Tipo de horario (grupo 1)' })).toBeInTheDocument();
  });

  it('carga una FORMA ANTIGUA (mode global, grupos sin mode) sin romper', () => {
    const old = {
      mode: 'partido',
      groups: [{ dias: [1, 2], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '20:00' }] }],
    } as unknown as BusinessSchedule;
    render(<HorarioNegocioForm value={old} onChange={() => {}} />);
    // El grupo se normaliza a partido (2 tramos) → radio "partido" seleccionado.
    const partido = screen.getByRole('radio', { name: 'Horario partido (grupo 1)' });
    expect(partido).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Inicio tramo 2 (grupo 1)')).toBeInTheDocument();
  });
});
