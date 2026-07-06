import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, screen, within } from '@testing-library/react';
import { NuevaCitaModal, buildCitaNotes, CANALES, ACCIONES_COMERCIALES } from '@/components/crm/nueva-cita-modal';

vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => {
    if (path.startsWith('/customers')) return Promise.resolve({ items: [{ id: 'c1', nombre: 'Ana' }] });
    if (path.startsWith('/services')) return Promise.resolve({ items: [{ id: 's1', nombre: 'Corte' }] });
    if (path.startsWith('/employees')) return Promise.resolve({ items: [{ id: 'e1', nombre: 'Bea' }] });
    if (path.startsWith('/locations')) return Promise.resolve({ items: [{ id: 'l1' }] });
    return Promise.resolve({ items: [] });
  },
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
}));

afterEach(() => cleanup());
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
