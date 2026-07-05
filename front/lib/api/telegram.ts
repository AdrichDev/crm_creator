'use client';
// Cliente REST de la Telegram UI (crm-operaos WU5). Conversaciones del tenant activo
// + respuesta manual. La ingesta entrante (webhook) es server-to-server (OpenClaw) y
// NO pasa por aquí. Idempotencia de envío: cada respuesta lleva un clientMessageId
// generado en el front (un doble submit no duplica el mensaje).
import { apiFetch } from '@/lib/api/client';

export type TelegramMessageDto = {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  text: string;
  providerMessageId: string | null;
  clientMessageId: string | null;
  remitente: string | null;
  createdAt: string;
};

export type TelegramConversationDto = {
  conversationId: string;
  remitente: string | null;
  lastText: string;
  lastAt: string;
  total: number;
};

export async function fetchConversations(): Promise<TelegramConversationDto[]> {
  const res = await apiFetch<{ conversations: TelegramConversationDto[] }>('/telegram/conversations');
  return res.conversations ?? [];
}

export async function fetchMessages(
  conversationId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ items: TelegramMessageDto[]; hasMore: boolean }> {
  const p = new URLSearchParams();
  if (opts.before) p.set('before', opts.before);
  if (opts.limit) p.set('limit', String(opts.limit));
  const qs = p.toString();
  const res = await apiFetch<{ items: TelegramMessageDto[]; hasMore: boolean }>(
    `/telegram/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ''}`,
  );
  return { items: res.items ?? [], hasMore: Boolean(res.hasMore) };
}

/** Genera una clave de idempotencia para el envío (una por intento del usuario). */
export function newClientMessageId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function replyToConversation(
  conversationId: string,
  text: string,
  clientMessageId: string,
): Promise<{ message: TelegramMessageDto; sent: boolean }> {
  return apiFetch<{ message: TelegramMessageDto; sent: boolean }>(
    `/telegram/conversations/${encodeURIComponent(conversationId)}/reply`,
    { method: 'POST', body: JSON.stringify({ text, clientMessageId }) },
  );
}
