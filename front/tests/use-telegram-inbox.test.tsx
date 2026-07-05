// Tests del hook de orquestación de la bandeja Minion (useTelegramInbox).
// Regresión del bug "mensaje enviado no se ve": un poll del hilo lanzado mientras el
// envío estaba en vuelo respondía con una lista vieja (sin el saliente) y, al hacer
// setMessages(items) completo, borraba el mensaje optimista de pantalla.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/api/telegram', () => ({
  fetchConversations: vi.fn(),
  fetchMessages: vi.fn(),
  replyToConversation: vi.fn(),
  newClientMessageId: () => 'cm-test',
}));

import { fetchConversations, fetchMessages, replyToConversation, type TelegramMessageDto } from '@/lib/api/telegram';
import { useTelegramInbox } from '@/lib/hooks/use-telegram-inbox';

const CONV = { conversationId: 'c1', remitente: 'Ana', lastText: 'Hola', lastAt: '2026-07-05T10:00:00Z', total: 1 };
const MSG_IN: TelegramMessageDto = {
  id: 'a', conversationId: 'c1', direction: 'in', text: 'Hola', providerMessageId: 'tg-1',
  clientMessageId: null, remitente: 'Ana', createdAt: '2026-07-05T09:00:00Z',
};
const MSG_OUT: TelegramMessageDto = {
  id: 'b', conversationId: 'c1', direction: 'out', text: 'Nos vemos', providerMessageId: null,
  clientMessageId: 'cm-test', remitente: null, createdAt: '2026-07-05T09:01:00Z',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchConversations).mockResolvedValue([CONV]);
  vi.mocked(fetchMessages).mockResolvedValue({ items: [MSG_IN], hasMore: false });
  vi.mocked(replyToConversation).mockResolvedValue({ message: MSG_OUT, sent: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe('useTelegramInbox', () => {
  it('inserta el saliente de forma optimista tras enviar', async () => {
    const { result } = renderHook(() => useTelegramInbox(true));
    await flush();
    expect(result.current.messages.map((m) => m.id)).toEqual(['a']);

    await act(async () => { await result.current.handleSend('Nos vemos'); });
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('el saliente sobrevive a un poll con respuesta desactualizada (regresión)', async () => {
    const { result } = renderHook(() => useTelegramInbox(true));
    await flush();

    await act(async () => { await result.current.handleSend('Nos vemos'); });
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b']);

    // El siguiente poll del hilo devuelve una página vieja SIN el saliente recién
    // persistido: no debe borrarlo de pantalla.
    vi.mocked(fetchMessages).mockResolvedValue({ items: [MSG_IN], hasMore: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('cuando el servidor ya devuelve el saliente no lo duplica', async () => {
    const { result } = renderHook(() => useTelegramInbox(true));
    await flush();

    await act(async () => { await result.current.handleSend('Nos vemos'); });

    vi.mocked(fetchMessages).mockResolvedValue({ items: [MSG_IN, MSG_OUT], hasMore: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
