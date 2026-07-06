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

describe('CitaDetalleModal — registro "Dirección" en la ficha (crm-operaos, pedido owner)', () => {
  it('con dirección: muestra el registro Dirección con el valor', () => {
    const cita: CitaConNotas = { ...CITA, direccion: 'C/ Mayor 3, Madrid' };
    render(<CitaDetalleModal cita={cita} onClose={vi.fn()} onSave={vi.fn()} onIrAgenda={vi.fn()} />);
    expect(screen.getByText('Dirección')).toBeInTheDocument();
    expect(screen.getByText('C/ Mayor 3, Madrid')).toBeInTheDocument();
  });

  it('sin dirección: no muestra el registro Dirección', () => {
    render(<CitaDetalleModal cita={CITA} onClose={vi.fn()} onSave={vi.fn()} onIrAgenda={vi.fn()} />);
    expect(screen.queryByText('Dirección')).not.toBeInTheDocument();
  });
});

describe('CitaDetalleModal — mapa Google Maps (crm-operaos WU3 / AC3)', () => {
  it('con dirección: embebe un iframe de Google Maps y el enlace "Abrir en Google Maps"', () => {
    const cita: CitaConNotas = { ...CITA, direccion: 'C/ Mayor 3, Madrid' };
    render(<CitaDetalleModal cita={cita} onClose={vi.fn()} onSave={vi.fn()} onIrAgenda={vi.fn()} />);
    const iframe = screen.getByTitle('Ubicación de la cita en Google Maps') as HTMLIFrameElement;
    expect(iframe.src).toBe('https://www.google.com/maps?q=C%2F%20Mayor%203%2C%20Madrid&output=embed');
    const link = screen.getByText('Abrir en Google Maps') as HTMLAnchorElement;
    expect(link.href).toBe('https://www.google.com/maps/search/?api=1&query=C%2F%20Mayor%203%2C%20Madrid');
  });

  it('sin dirección: no muestra bloque de mapa', () => {
    render(<CitaDetalleModal cita={CITA} onClose={vi.fn()} onSave={vi.fn()} onIrAgenda={vi.fn()} />);
    expect(screen.queryByTitle('Ubicación de la cita en Google Maps')).not.toBeInTheDocument();
    expect(screen.queryByText('Abrir en Google Maps')).not.toBeInTheDocument();
  });
});

describe('CitaDetalleModal — pin de ubicación junto a "Guardar anotación" (crm-operaos, sub-item pin)', () => {
  it('con dirección: pin a la izquierda con la URL de Google Maps, fila justify-between', () => {
    const cita: CitaConNotas = { ...CITA, direccion: 'C/ Mayor 3, Madrid' };
    render(<CitaDetalleModal cita={cita} onClose={vi.fn()} onSave={vi.fn()} onIrAgenda={vi.fn()} />);
    const pin = screen.getByLabelText('Abrir dirección en Google Maps') as HTMLAnchorElement;
    expect(pin.href).toBe('https://www.google.com/maps/search/?api=1&query=C%2F%20Mayor%203%2C%20Madrid');
    expect(pin.target).toBe('_blank');
    // Misma fila que "Guardar anotación", pin a la izquierda y botón a la derecha.
    const fila = pin.parentElement!;
    expect(fila).toHaveClass('justify-between');
    expect(fila.textContent).toContain('Guardar anotación');
    expect(fila.firstElementChild).toBe(pin);
  });

  it('sin dirección: el pin no se muestra y "Guardar anotación" sigue funcionando', () => {
    const onSave = vi.fn();
    render(<CitaDetalleModal cita={CITA} onClose={vi.fn()} onSave={onSave} onIrAgenda={vi.fn()} />);
    expect(screen.queryByLabelText('Abrir dirección en Google Maps')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Guardar anotación'));
    expect(onSave).toHaveBeenCalledWith('Alérgica al amoníaco');
  });
});
