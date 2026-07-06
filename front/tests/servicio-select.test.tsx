import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { groupServices, ServicioSelect, type ServiceOpt } from '@/components/crm/servicio-select';

// crm-citas-servicio-seccionado: el campo Servicio es un <select> con <optgroup>s. El
// catálogo real (reservable/con tarifa) va a "Servicios y tarifas"; las tareas/reuniones
// comerciales (reservableOnline=false, precio 0) a "Tareas y reuniones". Toda opción lleva
// un serviceId real → no rompe el contrato de POST/PATCH /bookings.

const SERVICES: ServiceOpt[] = [
  { id: 'srv1', nombre: 'Proyecto de interiorismo', precio: 1200, reservableOnline: true, requiereProfesional: true },
  { id: 'srv2', nombre: 'Diseño de paisajismo', precio: 800, reservableOnline: true, requiereProfesional: true },
  { id: 'task1', nombre: 'Visita comercial', precio: 0, reservableOnline: false, requiereProfesional: false },
  { id: 'task2', nombre: 'Reunión', precio: 0, reservableOnline: false, requiereProfesional: false },
];

afterEach(() => cleanup());

describe('groupServices — reparto en secciones', () => {
  it('separa catálogo real (tarifas) de tareas/reuniones comerciales', () => {
    const { tarifas, tareas } = groupServices(SERVICES);
    expect(tarifas.map((s) => s.id)).toEqual(['srv1', 'srv2']);
    expect(tareas.map((s) => s.id)).toEqual(['task1', 'task2']);
  });

  it('un servicio sin reservableOnline definido (default true) cae en tarifas', () => {
    const { tarifas, tareas } = groupServices([{ id: 'x', nombre: 'Sin flag', precio: 50 }]);
    expect(tarifas.map((s) => s.id)).toEqual(['x']);
    expect(tareas).toHaveLength(0);
  });
});

describe('ServicioSelect — optgroups y serviceId real', () => {
  it('renderiza las dos secciones como <optgroup> con opciones que llevan serviceId', () => {
    const { container } = render(<ServicioSelect services={SERVICES} value="" onChange={vi.fn()} />);
    const groups = container.querySelectorAll('optgroup');
    expect(Array.from(groups).map((g) => g.getAttribute('label'))).toEqual(['Servicios y tarifas', 'Tareas y reuniones']);

    // Cada opción del catálogo lleva su serviceId real como value.
    const opt = screen.getByRole('option', { name: 'Visita comercial' }) as HTMLOptionElement;
    expect(opt.value).toBe('task1');
    expect((screen.getByRole('option', { name: 'Proyecto de interiorismo' }) as HTMLOptionElement).value).toBe('srv1');
  });

  it('onChange emite el serviceId seleccionado', () => {
    const onChange = vi.fn();
    const { container } = render(<ServicioSelect services={SERVICES} value="" onChange={onChange} />);
    fireEvent.change(container.querySelector('select')!, { target: { value: 'srv2' } });
    expect(onChange).toHaveBeenCalledWith('srv2');
  });

  it('conserva el valor actual como opción suelta si aún no está en el catálogo (edición)', () => {
    render(<ServicioSelect services={[]} value="s1" onChange={vi.fn()} currentLabel="Corte" />);
    const opt = screen.getByRole('option', { name: 'Corte' }) as HTMLOptionElement;
    expect(opt.value).toBe('s1');
  });
});
