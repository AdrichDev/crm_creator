
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { TelegramConversationDto, TelegramMessageDto } from '@/lib/api/telegram';

export type OperatorMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string | null; pending?: boolean };
const pollMs = 5000;
const newId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useOperatorChat(enabled: boolean) {
  const [history, setHistory] = useState<OperatorMessage[]>([]);
  const [pending, setPending] = useState<OperatorMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading((v) => history.length === 0 ? true : v);
      const res = await apiFetch<{ messages: OperatorMessage[] }>('/operator-chat/history?limit=50');
      const server = Array.isArray(res.messages) ? res.messages : [];
      setHistory(server);
      setPending((prev) => prev.filter((p) => !server.some((m) => m.role === 'user' && m.text === p.text)));
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [enabled, history.length]);

  useEffect(() => { if (!enabled) return; void load(); const t = setInterval(() => void load(), pollMs); return () => clearInterval(t); }, [enabled, load]);

  const send = useCallback(async (text: string) => {
    const content = text.trim(); if (!content || sending) return;
    const clientMessageId = newId();
    setSending(true); setError(null);
    setPending((prev) => [...prev, { id: clientMessageId, role: 'user', text: content, createdAt: new Date().toISOString(), pending: true }]);
    try { await apiFetch('/operator-chat/send', { method: 'POST', body: JSON.stringify({ text: content, clientMessageId }) }); void load(); }
    catch (e) { setPending((prev) => prev.filter((m) => m.id !== clientMessageId)); setError((e as Error).message); }
    finally { setSending(false); }
  }, [sending, load]);

  const messages = useMemo<TelegramMessageDto[]>(() => [...history, ...pending].map((m) => ({
    id: m.id,
    conversationId: 'openclaw-operator',
    direction: m.role === 'user' ? 'out' : 'in',
    text: m.text,
    providerMessageId: m.pending ? null : m.id,
    clientMessageId: m.role === 'user' ? m.id : null,
    remitente: m.role === 'assistant' ? 'OpenClaw' : null,
    createdAt: m.createdAt ?? new Date().toISOString(),
  })), [history, pending]);

  const conversation = useMemo<TelegramConversationDto>(() => ({
    conversationId: 'openclaw-operator', remitente: 'OpenClaw @Estudio3ABot', lastText: messages.at(-1)?.text ?? '', lastAt: messages.at(-1)?.createdAt ?? new Date().toISOString(), total: messages.length,
  }), [messages]);

  return { conversation, messages, loading, sending, error, send };
}
