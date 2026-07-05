'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { PageHeader, Card, EmptyState } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import { TelegramConversacion } from '@/components/crm/telegram-conversacion';
import {
  fetchConversations, fetchMessages, replyToConversation, newClientMessageId,
  type TelegramConversationDto, type TelegramMessageDto,
} from '@/lib/api/telegram';

// Telegram UI (crm-operaos WU5 / AC5): lista de conversaciones del tenant + hilo en
// vivo con respuesta manual desde OperaOS. El bot real vive en OpenClaw; aquí solo se
// leen los mensajes persistidos y se envían respuestas (idempotentes por clientMessageId).
// Polling ligero para el "en directo" (sin WebSocket): conversaciones cada 15 s, hilo
// abierto cada 5 s.

const CONV_POLL_MS = 15_000;
const THREAD_POLL_MS = 5_000;

export default function Page() {
  const apiEnabled = isApiEnabled();
  const [conversations, setConversations] = useState<TelegramConversationDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TelegramMessageDto[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadConversations = useCallback(async () => {
    if (!apiEnabled) return;
    try {
      const list = await fetchConversations();
      setConversations(list);
      setActiveId((cur) => cur ?? list[0]?.conversationId ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apiEnabled]);

  const loadMessages = useCallback(async (conversationId: string, showSpinner = false) => {
    if (!apiEnabled) return;
    if (showSpinner) setLoadingThread(true);
    try {
      const { items } = await fetchMessages(conversationId);
      // Solo aplica si sigue siendo la conversación activa (evita carreras de polling).
      if (activeIdRef.current === conversationId) setMessages(items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (showSpinner) setLoadingThread(false);
    }
  }, [apiEnabled]);

  // Carga inicial + polling de conversaciones.
  useEffect(() => {
    void loadConversations();
    if (!apiEnabled) return;
    const t = setInterval(() => void loadConversations(), CONV_POLL_MS);
    return () => clearInterval(t);
  }, [loadConversations, apiEnabled]);

  // Al cambiar de conversación: carga con spinner + polling del hilo abierto.
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    void loadMessages(activeId, true);
    if (!apiEnabled) return;
    const t = setInterval(() => void loadMessages(activeId), THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [activeId, loadMessages, apiEnabled]);

  const active = conversations.find((c) => c.conversationId === activeId) ?? null;

  async function handleSend(text: string) {
    if (!activeId || sending) return;
    setSending(true);
    setError(null);
    const clientMessageId = newClientMessageId();
    try {
      const { message } = await replyToConversation(activeId, text, clientMessageId);
      // Inserción optimista: añade el saliente sin esperar al siguiente poll.
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      void loadConversations();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader title="Telegram" subtitle="Conversaciones del negocio en directo. Responde sin salir de OperaOS." />

      {!apiEnabled ? (
        <Card><div className="p-6"><EmptyState title="API no configurada" hint="Configura NEXT_PUBLIC_API_URL para ver las conversaciones de Telegram." /></div></Card>
      ) : (
        <>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
            <Card>
              <div className="max-h-[70vh] overflow-y-auto" data-testid="telegram-conversations">
                {conversations.length === 0 ? (
                  <div className="p-6"><EmptyState title="Sin conversaciones" hint="Aún no ha llegado ningún mensaje de Telegram." /></div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.conversationId}
                      onClick={() => setActiveId(c.conversationId)}
                      className={`flex w-full items-start gap-2 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
                        c.conversationId === activeId ? 'bg-emerald-50' : ''
                      }`}
                    >
                      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.remitente || c.conversationId}</span>
                        <span className="block truncate text-xs text-gray-500">{c.lastText}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <div className="h-[70vh]">
                <TelegramConversacion
                  conversation={active}
                  messages={messages}
                  loading={loadingThread}
                  sending={sending}
                  onSend={handleSend}
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
