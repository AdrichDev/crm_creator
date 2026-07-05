// UI tests del widget flotante de Telegram (chip persistente + panel abrir/cerrar).
// Se mockea la capa API para no tocar red: el foco es el comportamiento del widget.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => true,
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/api/telegram', () => ({
  fetchConversations: vi.fn().mockResolvedValue([]),
  fetchMessages: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  replyToConversation: vi.fn(),
  newClientMessageId: () => 'cm-test',
}));

import { TelegramWidget } from '@/components/crm/telegram-widget';

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe('TelegramWidget', () => {
  it('muestra el chip flotante y el panel arranca cerrado', () => {
    render(<TelegramWidget />);
    expect(screen.getByTestId('telegram-widget-chip')).toBeInTheDocument();
    expect(screen.queryByTestId('telegram-widget-panel')).not.toBeInTheDocument();
  });

  it('al pulsar el chip abre el panel y al cerrar vuelve a ocultarlo', async () => {
    render(<TelegramWidget />);
    const chip = screen.getByTestId('telegram-widget-chip');

    fireEvent.click(chip);
    expect(screen.getByTestId('telegram-widget-panel')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Sin conversaciones')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Cerrar panel de Minion'));
    expect(screen.queryByTestId('telegram-widget-panel')).not.toBeInTheDocument();
  });
});
