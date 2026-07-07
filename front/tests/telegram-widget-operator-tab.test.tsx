// Tests de la pestaña «OpenClaw»/«CRM» del widget flotante de Telegram
// (aa-centro-mando-agenda-telegram, tarea 5.5c). Se mockean los DOS hooks de
// orquestación directamente (en vez de la capa API) para verificar con precisión
// el cableado de `enabled`: cada pestaña debe habilitar un hook y deshabilitar el
// otro, sin depender del timing real de fetch/polling.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => true,
  apiFetch: vi.fn(),
}));

const useTelegramInboxMock = vi.fn();
vi.mock('@/lib/hooks/use-telegram-inbox', () => ({
  useTelegramInbox: (enabled: boolean) => useTelegramInboxMock(enabled),
}));

const useOperatorChatMock = vi.fn();
vi.mock('@/lib/hooks/use-operator-chat', () => ({
  useOperatorChat: (enabled: boolean) => useOperatorChatMock(enabled),
}));

import { TelegramWidget } from '@/components/crm/telegram-widget';

const INBOX_STUB = {
  conversations: [], activeId: null, setActiveId: vi.fn(), messages: [], active: null,
  loadingThread: false, sending: false, error: null, handleSend: vi.fn(),
};
const OPERATOR_STUB = {
  conversation: { conversationId: 'openclaw-operator', remitente: 'OpenClaw @Estudio3ABot', lastText: '', lastAt: '2026-07-06T00:00:00Z', total: 0 },
  messages: [], loading: false, sending: false, error: null, send: vi.fn(),
};

beforeEach(() => {
  useTelegramInboxMock.mockReturnValue(INBOX_STUB);
  useOperatorChatMock.mockReturnValue(OPERATOR_STUB);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function openPanel() {
  render(<TelegramWidget />);
  fireEvent.click(screen.getByTestId('telegram-widget-chip'));
}

describe('TelegramWidget — pestañas OpenClaw/CRM', () => {
  it('arranca en CRM: useTelegramInbox habilitado, useOperatorChat deshabilitado', () => {
    openPanel();

    expect(useTelegramInboxMock).toHaveBeenLastCalledWith(true);
    expect(useOperatorChatMock).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('telegram-widget-conversations')).toBeInTheDocument();
  });

  it('al pulsar «OpenClaw» invierte los flags enabled y muestra el hilo del operador', () => {
    openPanel();

    fireEvent.click(screen.getByText('OpenClaw'));

    expect(useTelegramInboxMock).toHaveBeenLastCalledWith(false);
    expect(useOperatorChatMock).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId('telegram-widget-conversations')).not.toBeInTheDocument();
    // El título del panel y el hilo del operador comparten el mismo texto: basta con
    // que aparezca (no importa cuántas veces) para confirmar que se renderiza el hilo.
    expect(screen.getAllByText('OpenClaw @Estudio3ABot').length).toBeGreaterThan(0);
  });

  it('al volver a pulsar «CRM» restaura el comportamiento previo', () => {
    openPanel();

    fireEvent.click(screen.getByText('OpenClaw'));
    fireEvent.click(screen.getByText('CRM'));

    expect(useTelegramInboxMock).toHaveBeenLastCalledWith(true);
    expect(useOperatorChatMock).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('telegram-widget-conversations')).toBeInTheDocument();
  });
});
