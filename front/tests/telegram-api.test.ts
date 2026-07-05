// Unit tests de lib/api/telegram.ts (crm-operaos WU5). Mockea apiFetch: sin red ni
// backend real. Verifica el contrato de rutas y la idempotencia por clientMessageId.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiBaseUrl: () => 'http://localhost:4001',
  isApiEnabled: () => true,
}));

import {
  fetchConversations, fetchMessages, replyToConversation, newClientMessageId,
} from '@/lib/api/telegram';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('fetchConversations', () => {
  it('GET /telegram/conversations y devuelve la lista', async () => {
    mockApiFetch.mockResolvedValue({ conversations: [{ conversationId: 'c1', remitente: 'Ana', lastText: 'Hola', lastAt: 'x', total: 2 }] });
    const res = await fetchConversations();
    expect(mockApiFetch).toHaveBeenCalledWith('/telegram/conversations');
    expect(res).toHaveLength(1);
    expect(res[0].conversationId).toBe('c1');
  });

  it('tolera respuesta sin conversations', async () => {
    mockApiFetch.mockResolvedValue({});
    expect(await fetchConversations()).toEqual([]);
  });
});

describe('fetchMessages', () => {
  it('GET mensajes de una conversación (sin cursor)', async () => {
    mockApiFetch.mockResolvedValue({ items: [], hasMore: false });
    await fetchMessages('chat 1');
    expect(mockApiFetch).toHaveBeenCalledWith('/telegram/conversations/chat%201/messages');
  });

  it('incluye before y limit en la query cuando se pasan', async () => {
    mockApiFetch.mockResolvedValue({ items: [], hasMore: true });
    const res = await fetchMessages('c1', { before: '2026-07-05T10:00:00Z', limit: 20 });
    const call = mockApiFetch.mock.calls[0][0] as string;
    expect(call).toContain('/telegram/conversations/c1/messages?');
    expect(call).toContain('before=2026-07-05T10%3A00%3A00Z');
    expect(call).toContain('limit=20');
    expect(res.hasMore).toBe(true);
  });
});

describe('replyToConversation', () => {
  it('POST reply con text + clientMessageId (idempotencia)', async () => {
    mockApiFetch.mockResolvedValue({ message: { id: 'm1' }, sent: true });
    const res = await replyToConversation('c1', 'Buenas', 'ck-1');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/telegram/conversations/c1/reply',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Buenas', clientMessageId: 'ck-1' }) }),
    );
    expect(res.sent).toBe(true);
  });
});

describe('newClientMessageId', () => {
  it('genera claves distintas por llamada', () => {
    expect(newClientMessageId()).not.toBe(newClientMessageId());
  });
});
