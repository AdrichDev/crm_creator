'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchConversations, fetchMessages, replyToConversation, newClientMessageId,
  type TelegramConversationDto, type TelegramMessageDto,
} from '@/lib/api/telegram';

// Orquestación compartida de la bandeja de Telegram (lista + hilo + envío) con polling
// ligero. La usan tanto la página /telegram como el widget flotante. El polling solo
// corre cuando `enabled` es true, de modo que el widget cerrado no genera red.
const CONV_POLL_MS = 15_000;
const THREAD_POLL_MS = 5_000;

/**
 * Mezcla la página del servidor con los salientes locales que aún no aparecen en ella.
 * Motivo (bug real): el polling del hilo reemplazaba el estado completo; un poll lanzado
 * mientras el envío estaba en vuelo resolvía con una lista SIN el mensaje recién enviado
 * y, al llegar después de la inserción optimista, lo borraba de pantalla hasta el
 * siguiente poll. Conservar los `out` locales ausentes (por id) hace que el saliente
 * nunca desaparezca, llegue o no el proveedor externo a confirmarlo.
 */
function mergeServerPage(server: TelegramMessageDto[], prev: TelegramMessageDto[]): TelegramMessageDto[] {
  const seen = new Set(server.map((m) => m.id));
  const pendingOut = prev.filter((m) => m.direction === 'out' && !seen.has(m.id));
  if (pendingOut.length === 0) return server;
  // createdAt es ISO-8601 UTC → orden lexicográfico == orden cronológico.
  return [...server, ...pendingOut].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useTelegramInbox(enabled: boolean) {
  const [conversations, setConversations] = useState<TelegramConversationDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TelegramMessageDto[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadConversations = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await fetchConversations();
      setConversations(list);
      setActiveId((cur) => cur ?? list[0]?.conversationId ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [enabled]);

  const loadMessages = useCallback(async (conversationId: string, showSpinner = false) => {
    if (!enabled) return;
    if (showSpinner) setLoadingThread(true);
    try {
      const { items } = await fetchMessages(conversationId);
      // Solo aplica si sigue siendo la conversación activa (evita carreras de polling)
      // y sin pisar salientes locales que el servidor aún no devuelve (ver mergeServerPage).
      if (activeIdRef.current === conversationId) setMessages((prev) => mergeServerPage(items, prev));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (showSpinner) setLoadingThread(false);
    }
  }, [enabled]);

  // Carga inicial + polling de conversaciones (solo mientras enabled).
  useEffect(() => {
    if (!enabled) return;
    void loadConversations();
    const t = setInterval(() => void loadConversations(), CONV_POLL_MS);
    return () => clearInterval(t);
  }, [loadConversations, enabled]);

  // Al cambiar de conversación: carga con spinner + polling del hilo abierto.
  useEffect(() => {
    if (!enabled) return;
    if (!activeId) { setMessages([]); return; }
    void loadMessages(activeId, true);
    const t = setInterval(() => void loadMessages(activeId), THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [activeId, loadMessages, enabled]);

  const active = conversations.find((c) => c.conversationId === activeId) ?? null;

  const handleSend = useCallback(async (text: string) => {
    if (!activeIdRef.current || sending) return;
    setSending(true);
    setError(null);
    const clientMessageId = newClientMessageId();
    try {
      const { message } = await replyToConversation(activeIdRef.current, text, clientMessageId);
      // Inserción optimista: añade el saliente sin esperar al siguiente poll.
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      void loadConversations();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [sending, loadConversations]);

  return {
    conversations, activeId, setActiveId, messages, active,
    loadingThread, sending, error, handleSend,
  };
}
