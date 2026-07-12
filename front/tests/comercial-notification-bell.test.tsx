import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let comercialActivo = true;
vi.mock('@/lib/tenant-config-context', () => ({
  useModuleEnabled: () => comercialActivo,
}));

let apiEnabled = true;
vi.mock('@/lib/api/client', () => ({ isApiEnabled: () => apiEnabled }));

const fetchReminderSummary = vi.fn();
const fetchReminders = vi.fn();
const fetchCitasPendientes = vi.fn();
const patchReminder = vi.fn();
vi.mock('@/lib/comercial/api', () => ({
  fetchReminderSummary: (...a: unknown[]) => fetchReminderSummary(...a),
  fetchReminders: (...a: unknown[]) => fetchReminders(...a),
  fetchCitasPendientes: (...a: unknown[]) => fetchCitasPendientes(...a),
  patchReminder: (...a: unknown[]) => patchReminder(...a),
}));

import { NotificationBell } from '@/components/layout/notification-bell';

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const NOW = new Date();
const ayer = new Date(NOW); ayer.setDate(ayer.getDate() - 1);
const en5dias = new Date(NOW); en5dias.setDate(en5dias.getDate() + 5);

const REMINDERS = [
  { id: 'r1', customerId: 'c1', customerNombre: 'Cliente Vencido', titulo: 'Llamar', fechaPrevista: ayer.toISOString(), estado: 'PENDING', createdAt: '' },
  { id: 'r2', customerId: 'c2', customerNombre: 'Cliente Futuro', titulo: 'Visitar en 5 días', fechaPrevista: en5dias.toISOString(), estado: 'PENDING', createdAt: '' },
];

describe('NotificationBell — campana de notificaciones (WU4.1, AC6)', () => {
  beforeEach(() => {
    comercialActivo = true;
    apiEnabled = true;
    fetchReminderSummary.mockReset().mockResolvedValue({ vencidos: 1, hoy: 0, proximos7d: 1 });
    fetchReminders.mockReset().mockResolvedValue(REMINDERS);
    fetchCitasPendientes.mockReset().mockResolvedValue([]);
    patchReminder.mockReset().mockResolvedValue({});
    push.mockReset();
  });
  afterEach(() => cleanup());

  it('sin módulo comercial activo: no se renderiza', async () => {
    comercialActivo = false;
    const { container } = render(<NotificationBell />);
    await flush();
    expect(container.firstChild).toBeNull();
  });

  it('badge = vencidos + hoy del summary', async () => {
    fetchReminderSummary.mockResolvedValue({ vencidos: 2, hoy: 3, proximos7d: 4 });
    render(<NotificationBell />);
    await flush();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('sin vencidos ni hoy: no muestra badge numérico', async () => {
    fetchReminderSummary.mockResolvedValue({ vencidos: 0, hoy: 0, proximos7d: 2 });
    render(<NotificationBell />);
    await flush();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('dropdown: solo lista ítems vencidos/hoy, no los próximos (filtra por urgencia)', async () => {
    render(<NotificationBell />);
    await flush();
    fireEvent.click(screen.getByLabelText('Notificaciones'));
    expect(screen.getByText('Cliente Vencido')).toBeInTheDocument();
    expect(screen.queryByText('Cliente Futuro')).toBeNull();
  });

  it('completar un ítem: llama a PATCH y revalida (el contador baja sin recargar la página, AC6)', async () => {
    render(<NotificationBell />);
    await flush();
    fireEvent.click(screen.getByLabelText('Notificaciones'));
    expect(screen.getByText('1')).toBeInTheDocument(); // badge inicial = vencidos(1)+hoy(0)

    fetchReminderSummary.mockResolvedValue({ vencidos: 0, hoy: 0, proximos7d: 1 });
    fetchReminders.mockResolvedValue([REMINDERS[1]]);

    fireEvent.click(screen.getByText('Completar'));
    await flush();

    expect(patchReminder).toHaveBeenCalledWith('r1', { estado: 'DONE' });
    expect(fetchReminderSummary).toHaveBeenCalledTimes(2); // carga inicial + revalidación
  });

  it('deep-link a la ficha: navega a /comercial?customerId=<id>', async () => {
    render(<NotificationBell />);
    await flush();
    fireEvent.click(screen.getByLabelText('Notificaciones'));
    fireEvent.click(screen.getByText('Cliente Vencido'));
    expect(push).toHaveBeenCalledWith('/comercial?customerId=c1');
  });

  it('revalida al enfocar la ventana', async () => {
    render(<NotificationBell />);
    await flush();
    expect(fetchReminderSummary).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    expect(fetchReminderSummary).toHaveBeenCalledTimes(2);
  });
});
