import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import {
  ContactosLista, isToday, isSameCalendarDay, type ContactoRow,
} from '@/components/crm/contactos-lista';

// UI test de la lista de contactos (crm-operaos WU4 / AC4): paridad visual/lógica con AA.
// primitives.tsx importa next/navigation en su cadena de módulo → lo mockeamos.
vi.mock('next/navigation', () => ({ usePathname: () => '/contactos' }));
vi.mock('@/lib/tenant-config-context', () => ({ useRole: () => ({ role: 'admin' }) }));

// Reloj FIJO para todo el archivo: la fila de Marta necesita createdAt = "hoy"
// (para la insignia N), pero un `new Date()` real hacía el snapshot no
// determinista — se congelaba la hora de generación y fallaba en cualquier otra
// corrida (flaky permanente). Instante en UTC para que el ISO sea idéntico
// siempre; el fake timer hace que isToday() y el snapshot vean el mismo "hoy".
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(new Date('2026-07-05T12:00:00.000Z'));

afterEach(() => cleanup());
afterAll(() => vi.useRealTimers());

const rows: ContactoRow[] = [
  { id: '1', codigo: 'pc-01', tipo: 'lead', nombre: 'Marta Ibáñez', telefono: '600111222', email: 'marta@x.com', sector: 'Retail', direccion: 'Calle 1', peticion: null, contactado: 'no', createdAt: new Date().toISOString() },
  { id: '2', codigo: 'pc-02', tipo: 'prospecto', nombre: 'Diego Serrano', telefono: null, email: null, sector: null, direccion: null, peticion: null, contactado: 'si', createdAt: '2026-01-01T10:00:00.000Z' },
];

function renderList(puedeEditar = true) {
  return render(
    <table><tbody>
      <ContactosLista
        rows={rows} puedeEditar={puedeEditar} selectionMode={false} selectedIds={new Set()}
        onToggleSelect={vi.fn()} onCycleContactado={vi.fn()} onInfo={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
      />
    </tbody></table>,
  );
}

describe('ContactosLista (AC4)', () => {
  it('renderiza código, tipo, nombre y estado de contacto por fila', () => {
    renderList();
    expect(screen.getByText('pc-01')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
    expect(screen.getByText('Prospecto')).toBeInTheDocument();
    expect(screen.getByText('Marta Ibáñez')).toBeInTheDocument();
    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('marca con la insignia "N" un contacto nuevo hoy y no contactado', () => {
    renderList();
    // Marta: creada hoy y contactado != 'si' → badge N. Diego: contactado 'si' → sin N.
    expect(screen.getByTitle('Nuevo hoy — pendiente de contactar')).toBeInTheDocument();
    expect(screen.getAllByText('N')).toHaveLength(1);
  });

  it('oculta acciones de editar/eliminar cuando el rol no puede escribir', () => {
    renderList(false);
    expect(screen.queryByTitle('Editar')).toBeNull();
    expect(screen.queryByTitle('Eliminar')).toBeNull();
    // La acción de ver información sigue disponible.
    expect(screen.getAllByTitle('Ver información')).toHaveLength(2);
  });

  it('coincide con el snapshot de UI', () => {
    const { container } = renderList();
    expect(container).toMatchSnapshot();
  });
});

describe('isToday helper', () => {
  it('detecta hoy vs. fecha pasada', () => {
    expect(isToday(new Date().toISOString())).toBe(true);
    expect(isToday('2020-01-01T00:00:00.000Z')).toBe(false);
  });
});

describe('isSameCalendarDay helper (filtro de fecha)', () => {
  it('sin fecha de filtro, siempre coincide', () => {
    expect(isSameCalendarDay('2026-07-05T10:00:00.000Z', '')).toBe(true);
  });
  it('coincide el mismo día calendario, ignorando la hora', () => {
    expect(isSameCalendarDay('2026-07-05T23:59:00.000', '2026-07-05')).toBe(true);
  });
  it('no coincide un día distinto', () => {
    expect(isSameCalendarDay('2026-07-04T23:59:00.000', '2026-07-05')).toBe(false);
  });
  it('ISO no parseable no coincide', () => {
    expect(isSameCalendarDay('not-a-date', '2026-07-05')).toBe(false);
  });
});
