// crm-citas-google-calendar (WU4.1) — sección "Calendario" en Mi Cuenta.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act, waitFor } from '@testing-library/react';

let apiEnabled = true;
vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => apiEnabled }));

const getCalendarStatus = vi.fn();
const generateCalendarToken = vi.fn();
const revokeCalendarToken = vi.fn();
const updateCalendarPushEnabled = vi.fn();
vi.mock('@/lib/api/calendar', () => ({
  getCalendarStatus: (...a: unknown[]) => getCalendarStatus(...a),
  generateCalendarToken: (...a: unknown[]) => generateCalendarToken(...a),
  revokeCalendarToken: (...a: unknown[]) => revokeCalendarToken(...a),
  updateCalendarPushEnabled: (...a: unknown[]) => updateCalendarPushEnabled(...a),
  calendarFeedUrl: (path: string) => `http://localhost:4001/api${path}`,
}));

import { CalendarSection } from '@/components/config/calendar-section';

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('CalendarSection — Mi Cuenta (WU4.1)', () => {
  beforeEach(() => {
    apiEnabled = true;
    getCalendarStatus.mockReset().mockResolvedValue({ hasToken: false, pushEnabled: false });
    generateCalendarToken.mockReset().mockResolvedValue({
      token: 'abc123def456', path: '/calendar/feed/abc123def456.ics', regenerated: false,
    });
    revokeCalendarToken.mockReset().mockResolvedValue(undefined);
    updateCalendarPushEnabled.mockReset().mockResolvedValue({ pushEnabled: true });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  afterEach(() => cleanup());

  it('sin backend configurado: no se renderiza', async () => {
    apiEnabled = false;
    const { container } = render(<CalendarSection />);
    await flush();
    expect(container.firstChild).toBeNull();
  });

  it('sin token: muestra botón "Generar URL" y el aviso de latencia', async () => {
    render(<CalendarSection />);
    await flush();
    expect(screen.getByText('Generar URL')).toBeInTheDocument();
    expect(screen.getByText(/puede tardar varias horas/i)).toBeInTheDocument();
    expect(screen.queryByText('Revocar')).toBeNull();
  });

  it('generar: muestra la URL una sola vez con botón de copiar (AC7)', async () => {
    render(<CalendarSection />);
    await flush();
    fireEvent.click(screen.getByText('Generar URL'));
    await flush();

    expect(generateCalendarToken).toHaveBeenCalledTimes(1);
    const input = screen.getByDisplayValue('http://localhost:4001/api/calendar/feed/abc123def456.ics');
    expect(input).toBeInTheDocument();
    expect(screen.getByText('Copiar URL')).toBeInTheDocument();
    // Tras generar, el botón pasa a decir "Regenerar URL" y aparece "Revocar".
    expect(screen.getByText('Regenerar URL')).toBeInTheDocument();
    expect(screen.getByText('Revocar')).toBeInTheDocument();
  });

  it('copiar: llama a clipboard.writeText con la URL revelada', async () => {
    render(<CalendarSection />);
    await flush();
    fireEvent.click(screen.getByText('Generar URL'));
    await flush();
    fireEvent.click(screen.getByText('Copiar URL'));
    await flush();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:4001/api/calendar/feed/abc123def456.ics');
    expect(screen.getByText('Copiada ✓')).toBeInTheDocument();
  });

  it('con token ya existente (recarga de página): NO vuelve a mostrar la URL en claro, pero permite regenerar/revocar', async () => {
    getCalendarStatus.mockResolvedValue({ hasToken: true, pushEnabled: false });
    render(<CalendarSection />);
    await flush();
    expect(screen.queryByDisplayValue(/http/)).toBeNull();
    expect(screen.getByText('Regenerar URL')).toBeInTheDocument();
    expect(screen.getByText('Revocar')).toBeInTheDocument();
    expect(screen.getByText(/no se muestra de nuevo/i)).toBeInTheDocument();
  });

  it('revocar: llama a revokeCalendarToken y oculta el botón Revocar', async () => {
    getCalendarStatus.mockResolvedValue({ hasToken: true, pushEnabled: false });
    render(<CalendarSection />);
    await flush();
    fireEvent.click(screen.getByText('Revocar'));
    await flush();
    expect(revokeCalendarToken).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Revocar')).toBeNull();
    expect(screen.getByText('Generar URL')).toBeInTheDocument();
  });

  it('regenerar tras ya tener token: vuelve a revelar una nueva URL (invalida la anterior)', async () => {
    getCalendarStatus.mockResolvedValue({ hasToken: true, pushEnabled: false });
    render(<CalendarSection />);
    await flush();
    generateCalendarToken.mockResolvedValue({
      token: 'nuevo999', path: '/calendar/feed/nuevo999.ics', regenerated: true,
    });
    fireEvent.click(screen.getByText('Regenerar URL'));
    await flush();
    expect(screen.getByDisplayValue('http://localhost:4001/api/calendar/feed/nuevo999.ics')).toBeInTheDocument();
  });

  it('toggle de push: refleja el estado inicial y llama a updateCalendarPushEnabled al cambiar', async () => {
    getCalendarStatus.mockResolvedValue({ hasToken: false, pushEnabled: false });
    render(<CalendarSection />);
    await flush();
    const toggle = screen.getByRole('button', { name: '' , pressed: false });
    fireEvent.click(toggle);
    await flush();
    expect(updateCalendarPushEnabled).toHaveBeenCalledWith(true);
  });

  it('toggle ya activo al cargar (aria-pressed=true)', async () => {
    getCalendarStatus.mockResolvedValue({ hasToken: false, pushEnabled: true });
    render(<CalendarSection />);
    await flush();
    const toggle = screen.getByRole('button', { pressed: true });
    expect(toggle).toBeInTheDocument();
  });

  it('error al generar: muestra el mensaje sin romper el resto de la UI', async () => {
    generateCalendarToken.mockRejectedValue(new Error('Error 500'));
    render(<CalendarSection />);
    await flush();
    fireEvent.click(screen.getByText('Generar URL'));
    await waitFor(() => expect(screen.getByText('Error 500')).toBeInTheDocument());
  });
});
