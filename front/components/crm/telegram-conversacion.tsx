'use client';
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui/primitives';
import type { TelegramConversationDto, TelegramMessageDto } from '@/lib/api/telegram';

// Detalle de una conversación de Telegram (crm-operaos WU5 / AC5): hilo en vivo +
// formulario de respuesta. Componente presentacional: recibe mensajes y callbacks,
// no habla con la API directamente (la orquestación vive en la page). Así es testeable
// sin mockear red.

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5);
};

export function TelegramConversacion({
  conversation,
  messages,
  loading = false,
  sending = false,
  onSend,
  isOperatorTab = false,
}: {
  conversation: TelegramConversationDto | null;
  messages: TelegramMessageDto[];
  loading?: boolean;
  sending?: boolean;
  onSend: (text: string) => void;
  isOperatorTab?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll al último mensaje cuando cambia el hilo (chat en vivo). Se ancla al id
  // del último mensaje (no a length): un poll puede sustituir la página manteniendo el
  // mismo número de mensajes pero con un último distinto.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastMessageId, conversation?.conversationId]);

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title="Sin conversación seleccionada" hint="Elige un contacto para ver el chat." />
      </div>
    );
  }

  function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    onSend(text);
    setDraft('');
  }

  const titulo = conversation.remitente || conversation.conversationId;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="font-semibold">{titulo}</p>
        <p className="text-xs text-[var(--panel-muted)]">Minion · {conversation.total} mensajes</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3" data-testid="telegram-thread">
        {loading && messages.length === 0 ? (
          <p className="text-sm text-[var(--panel-muted)]">Cargando mensajes…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--panel-muted)]">No hay mensajes todavía.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              data-direction={m.direction}
              className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm border ${
                  m.direction === 'out'
                    ? 'bg-[var(--acc)] text-[var(--panel-bg)] border-transparent'
                    : isOperatorTab
                    ? 'bg-[var(--acc-light)] text-[#0a0a0a] border-transparent'
                    : 'bg-[var(--panel-bg)] text-[var(--panel-text)] border-[var(--line)]'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p
                  className={`mt-1 text-[10px] ${
                    m.direction === 'out'
                      ? 'text-[var(--panel-bg)]/75'
                      : isOperatorTab
                      ? 'text-[#0a0a0a]/70'
                      : 'text-[var(--panel-muted)]'
                  }`}
                >
                  {hhmm(m.createdAt)}
                  {m.direction === 'out' && m.providerMessageId == null ? ' · pendiente' : ''}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[var(--line)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Escribe una respuesta"
            className="min-h-[42px] flex-1 resize-none rounded-md border border-[var(--line)] bg-[var(--panel-bg)] text-[var(--panel-text)] px-3 py-2 text-sm focus:border-[var(--acc)] focus:outline-none placeholder-[var(--panel-muted)]"
            placeholder="Escribe una respuesta…"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button onClick={submit} disabled={sending || !draft.trim()}>
            <Send className="h-4 w-4" /> {sending ? 'Enviando…' : 'Responder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
