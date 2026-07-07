import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, screen, within, fireEvent } from '@testing-library/react';
import { NuevaCitaModal, buildCitaNotes, CANALES, ACCIONES_COMERCIALES } from '@/components/crm/nueva-cita-modal';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiFetch: apiFetchMock }));

apiFetchMock.mockImplementation((path: string) => {
  if (path.startsWith('/customers')) return Promise.resolve({ items: [{ id: 'c1', nombre: 'Ana' }] });
  // Catálogo con un servicio real (tarifa/reservable) y una tarea comercial
  // (reservableOnline=false, precio 0) para verificar el reparto en optgroups.
  if (path.startsWith('/services')) return Promise.resolve({ items: [
    { id: 's1', nombre: 'Corte', precio: 20, reservableOnline: true, requiereProfesional: true },
    { id: 't1', nombre: 'Reunión', precio: 0, reservableOnline: false, requiereProfesional: false },
    { id: 'o1', nombre: 'Otros', precio: 0, reservableOnline: false, requiereProfesional: false },
  ] });
  // El admin del negocio (materializado por ensureAdminEmployee) debe aparecer.
  if (path.startsWith('/employees')) return Promise.resolve({ items: [
    { id: 'e1', nombre: 'Bea' },
    { id: 'admin1', nombre: 'Admin Jefe' },
  ] });
  if (path.startsWith('/locations')) return Promise.resolve({ items: [{ id: 'l1' }] });
  if (path.startsWith('/bookings/slots')) return Promise.resolve({ slots: [{ hora: '11:00', disponible: true }] });
  if (path.startsWith('/bookings')) return Promise.resolve({ id: 'b1' });
  return Promise.resolve({ items: [] });
});

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
}));

afterEach(() => { cleanup(); apiFetchMock.mockClear(); });
async function flush() { await act(async () => { await Promise.resolve(); }); }

// crm-modales-hover-unificados WU3 (AC4): NuevaCitaModal conserva su chasis propio,
// pero con borde theme-aware garantizado (.crm-modal-panel), nunca fundido con el backdrop.
describe('NuevaCitaModal — borde theme-aware (WU3)', () => {
  it('renderiza con borde de contraste garantizado (.crm-modal-panel)', async () => {
    const { container } = render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(container.querySelector('.crm-modal-panel')).toBeInTheDocument();
  });

  it('cerrado no renderiza nada', () => {
    const { container } = render(<NuevaCitaModal open={false} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// crm-citas-servicio-seccionado: el campo Servicio es un <select> seccionado (optgroups)
// alimentado por GET /services; toda opción lleva un serviceId real.
describe('NuevaCitaModal — Servicio seccionado con optgroups', () => {
  it('reparte el catálogo en "Servicios y tarifas" y "Tareas y reuniones"', async () => {
    const { container } = render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();

    const labels = Array.from(container.querySelectorAll('optgroup')).map((g) => g.getAttribute('label'));
    expect(labels).toContain('Servicios y tarifas');
    expect(labels).toContain('Tareas y reuniones');

    // "Corte" (tarifa) y "Reunión" (tarea) son opciones con su serviceId real.
    expect((screen.getByRole('option', { name: 'Corte' }) as HTMLOptionElement).value).toBe('s1');
    expect((screen.getByRole('option', { name: 'Reunión' }) as HTMLOptionElement).value).toBe('t1');
  });
});

// crm-servicio-otros-comentarios: elegir "Otros" en el Servicio revela un input
// "Comentarios" que se pliega en `notes` (buildCitaNotes).
describe('NuevaCitaModal — Servicio "Otros" revela Comentarios', () => {
  it('sin "Otros" seleccionado no muestra el input Comentarios', async () => {
    render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(screen.queryByText('Comentarios')).not.toBeInTheDocument();
  });

  it('al elegir "Otros" aparece el input Comentarios; al volver a otro servicio, desaparece', async () => {
    render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    const servicioSelect = (screen.getByRole('option', { name: 'Otros' }) as HTMLOptionElement).closest('select')!;
    fireEvent.change(servicioSelect, { target: { value: 'o1' } });
    expect(screen.getByText('Comentarios')).toBeInTheDocument();

    fireEvent.change(servicioSelect, { target: { value: 's1' } });
    expect(screen.queryByText('Comentarios')).not.toBeInTheDocument();
  });
});

// crm-cita-sin-cliente: se puede agendar sin cliente vinculado (visita médica, comida,
// recado personal…). El back ya acepta customerId ausente (mismo camino que las citas de
// equipo); el front no debe bloquear el envío por no elegir Cliente.
describe('NuevaCitaModal — se puede crear una cita SIN cliente vinculado', () => {
  it('el placeholder de Cliente ya no lleva asterisco de obligatorio', async () => {
    render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(screen.getByText('— Sin cliente (cita personal) —')).toBeInTheDocument();
    expect(screen.queryByText('Cliente *')).not.toBeInTheDocument();
  });

  it('enviar sin elegir Cliente hace POST /bookings con customerId undefined', async () => {
    const onCreated = vi.fn();
    const { container } = render(<NuevaCitaModal open onClose={vi.fn()} onCreated={onCreated} />);
    await flush();

    // Servicio (obligatorio).
    const servicioSelect = (screen.getByRole('option', { name: 'Corte' }) as HTMLOptionElement).closest('select')!;
    fireEvent.change(servicioSelect, { target: { value: 's1' } });

    // Fecha (obligatoria) — sin label ligado por htmlFor, se busca por type.
    const fechaInput = container.querySelector('input[type="date"]')!;
    fireEvent.change(fechaInput, { target: { value: '2026-07-20' } });
    await flush();

    // Hora vía chip real (obligatoria).
    const chip = await screen.findByRole('button', { name: '11:00' });
    fireEvent.click(chip);

    // Cliente queda en "— Sin cliente —" (nunca se tocó).
    fireEvent.click(screen.getByText('Crear cita'));
    await flush();

    const postCall = apiFetchMock.mock.calls.find((c) => c[0] === '/bookings' && c[1]?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1].body);
    expect(body.customerId).toBeUndefined();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});

// El desplegable Profesional lista TODOS los trabajadores del negocio, incluido el admin
// (materializado como empleado por ensureAdminEmployee en el vertical comerciales).
describe('NuevaCitaModal — Profesional incluye al admin', () => {
  it('el <select> de Profesional lista a todos los empleados devueltos por /employees', async () => {
    render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();

    const cualquiera = screen.getByText('Cualquiera');
    const profSelect = cualquiera.closest('select') as HTMLSelectElement;
    expect(within(profSelect).getByRole('option', { name: 'Bea' })).toBeInTheDocument();
    expect(within(profSelect).getByRole('option', { name: 'Admin Jefe' })).toBeInTheDocument();
  });
});

// crm-cita-fecha-hora-gris: los inputs de fecha/hora del modal de nueva cita cuelgan de
// .crm-cita-modal, el ámbito que los pinta en gris (--panel-muted) vía globals.css.
describe('NuevaCitaModal — fecha/hora en el ámbito gris (.crm-cita-modal)', () => {
  it('el input de fecha está dentro de .crm-cita-modal', async () => {
    const { container } = render(<NuevaCitaModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    const scope = container.querySelector('.crm-cita-modal');
    expect(scope).toBeInTheDocument();
    expect(scope!.querySelector('input[type="date"]')).toBeInTheDocument();
  });
});

// crm-operaos-agenda-contactos-fichaje-telegram (sub-item): campo Acción comercial +
// canal 'Llamada'. La cita comercial persiste acción/canal en `notes` con formato canónico.
describe('buildCitaNotes — formato canónico de notes comerciales', () => {
  it('acción + canal → "Acción: <accion> | Canal: <canal>"', () => {
    expect(buildCitaNotes('Visita comercial', 'Presencial')).toBe('Acción: Visita comercial | Canal: Presencial');
  });

  it('sólo canal → "Canal: <canal>" (retrocompatible)', () => {
    expect(buildCitaNotes('', 'Videollamada')).toBe('Canal: Videollamada');
    expect(buildCitaNotes('   ', 'Llamada')).toBe('Canal: Llamada');
  });

  it('sólo acción → "Acción: <accion>"', () => {
    expect(buildCitaNotes('Prospección', '')).toBe('Acción: Prospección');
  });

  it('ninguno → undefined', () => {
    expect(buildCitaNotes('', '')).toBeUndefined();
    expect(buildCitaNotes('  ', '  ')).toBeUndefined();
  });

  it('con comentarios (Servicio "Otros") → tercer segmento "Comentarios: <texto>"', () => {
    expect(buildCitaNotes('Visita comercial', 'Presencial', 'Cliente pide revisar el jardín trasero'))
      .toBe('Acción: Visita comercial | Canal: Presencial | Comentarios: Cliente pide revisar el jardín trasero');
  });

  it('solo comentarios (sin acción ni canal) → "Comentarios: <texto>"', () => {
    expect(buildCitaNotes('', '', 'Reunión de seguimiento trimestral')).toBe('Comentarios: Reunión de seguimiento trimestral');
  });

  it('comentarios vacío no añade el segmento', () => {
    expect(buildCitaNotes('Prospección', '', '   ')).toBe('Acción: Prospección');
  });

  it('CANALES incluye Presencial, Videollamada y Llamada', () => {
    expect(CANALES).toEqual(['Presencial', 'Videollamada', 'Llamada']);
    expect(CANALES).toContain('Llamada');
  });

  it('ACCIONES_COMERCIALES contiene las acciones predefinidas', () => {
    expect(ACCIONES_COMERCIALES).toContain('Visita comercial');
    expect(ACCIONES_COMERCIALES).toContain('Firma de contrato');
    expect(ACCIONES_COMERCIALES.length).toBe(8);
  });
});

// crm-operaos (fix 3): el campo "Acción" pasa de <input list> (combobox editable) a un
// <select> real con las opciones predefinidas — mismo chasis que Cliente/Servicio/Canal.
describe('NuevaCitaModal — Acción es un <select> con opciones predefinidas', () => {
  it('con mostrarCanal, "Acción" es un <select> (no un input list) con las 8 acciones + placeholder', async () => {
    const { container } = render(<NuevaCitaModal open mostrarCanal onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();

    // Ya no hay combobox editable con datalist.
    expect(container.querySelector('input[list]')).toBeNull();
    expect(container.querySelector('datalist')).toBeNull();

    // El <select> de Acción se identifica por su opción placeholder.
    const placeholder = screen.getByText('Selecciona una acción…');
    const accionSelect = placeholder.closest('select') as HTMLSelectElement;
    expect(accionSelect).toBeTruthy();
    expect(accionSelect.tagName).toBe('SELECT');
    // Contiene todas las acciones predefinidas como <option>.
    for (const a of ACCIONES_COMERCIALES) {
      expect(within(accionSelect).getByRole('option', { name: a })).toBeInTheDocument();
    }
    // placeholder + 8 acciones = 9 opciones.
    expect(accionSelect.querySelectorAll('option').length).toBe(ACCIONES_COMERCIALES.length + 1);
  });
});

// Anotaciones bajo Canal (vertical comerciales): única fuente de `form.comentarios`,
// se pliega en `notes` vía buildCitaNotes igual que el textarea "Otros" al que sustituye.
describe('NuevaCitaModal — Anotaciones bajo Canal (mostrarCanal)', () => {
  it('con mostrarCanal muestra el textarea Anotaciones y NO duplica el de "Otros"', async () => {
    render(<NuevaCitaModal open mostrarCanal onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();
    expect(screen.getByText('Anotaciones')).toBeInTheDocument();
    // Un único textarea de comentarios: el de "Otros" queda suprimido en esta vertical.
    expect(screen.queryByText('Comentarios')).not.toBeInTheDocument();
  });

  it('el texto escrito en Anotaciones viaja como segmento Comentarios en el POST', async () => {
    const { container } = render(<NuevaCitaModal open mostrarCanal onClose={vi.fn()} onCreated={vi.fn()} />);
    await flush();

    const placeholder = screen.getByText('Anotaciones');
    const textarea = placeholder.parentElement!.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'Cliente pide revisar el jardín trasero' } });

    // Servicio + fecha (obligatorios para que carguen los chips de hora, igual que en el
    // test "sin cliente" — GET /bookings/slots exige ambos).
    const servicioSelect = (screen.getByRole('option', { name: 'Corte' }) as HTMLOptionElement).closest('select')!;
    fireEvent.change(servicioSelect, { target: { value: 's1' } });
    const fechaInput = container.querySelector('input[type="date"]')!;
    fireEvent.change(fechaInput, { target: { value: '2026-07-20' } });
    await flush();

    const chip = await screen.findByRole('button', { name: '11:00' });
    fireEvent.click(chip);
    fireEvent.click(screen.getByText('Crear cita'));
    await flush();

    const postCall = apiFetchMock.mock.calls.find((c) => c[0] === '/bookings' && c[1]?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1].body);
    expect(body.notes).toContain('Comentarios: Cliente pide revisar el jardín trasero');
  });
});
