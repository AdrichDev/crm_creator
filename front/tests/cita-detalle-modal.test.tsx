import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { CitaDetalleModal, type CitaConNotas } from '@/components/crm/cita-detalle-modal';

afterEach(() => cleanup());

const CITA: CitaConNotas = {
  id: 1, cliente: 'Lucía Fernández', servicio: 'Corte + peinado', empleado: 'Sara',
  fecha: '2026-06-16', hora: '10:00', estado: 'Confirmada', notes: 'Alérgica al amoníaco',
};

describe('CitaDetalleModal (crm-citas-ux-agenda WU5 / AC5)', () => {
  it('muestra los datos de la cita y las anotaciones precargadas', () => {
    render(<CitaDetalleModal cita={CITA} onClose={vi.fn()} onSave={vi.fn()} onIrAgenda={vi.fn()} />);
    expect(screen.getByText('Lucía Fernández')).toBeInTheDocument();
    expect(screen.getByText('Corte + peinado')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alérgica al amoníaco')).toBeInTheDocument();
  });

  it('Guardar anotación llama a onSave con el texto editado', () => {
    const onSave = vi.fn();
    render(<CitaDetalleModal cita={CITA} onClose={vi.fn()} onSave={onSave} onIrAgenda={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('Alérgica al amoníaco'), { target: { value: 'Prefiere agua tibia' } });
    fireEvent.click(screen.getByText('Guardar anotación'));
    expect(onSave).toHaveBeenCalledWith('Prefiere agua tibia');
  });

  it('Cerrar (outline) llama a onClose e Ir a agenda (primary) llama a onIrAgenda', () => {
    const onClose = vi.fn();
    const onIrAgenda = vi.fn();
    const { container } = render(<CitaDetalleModal cita={CITA} onClose={onClose} onSave={vi.fn()} onIrAgenda={onIrAgenda} />);
    // El header del Modal también tiene un botón "×" con aria-label="Cerrar" — se
    // escopa al footer para el botón outline explícito de este modal.
    const footer = within(container.querySelector('.opera-modal-foot')!);
    const cerrar = footer.getByRole('button', { name: 'Cerrar' });
    expect(cerrar).toHaveClass('btn-outline');
    fireEvent.click(cerrar);
    expect(onClose).toHaveBeenCalledTimes(1);
    const irAgenda = footer.getByRole('button', { name: 'Ir a agenda' });
    expect(irAgenda).toHaveClass('btn-primary');
    fireEvent.click(irAgenda);
    expect(onIrAgenda).toHaveBeenCalledTimes(1);
  });

  it('sin cita (cita=null) no renderiza nada', () => {
    const { container } = render(<CitaDetalleModal cita={null} onClose={vi.fn()} onSave={vi.fn()} onIrAgenda={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
