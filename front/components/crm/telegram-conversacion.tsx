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
}: {
  conversation: TelegramConversationDto | null;
  messages: TelegramMessageDto[];
  loading?: boolean;
  sending?: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll al último mensaje cuando cambia el hilo (chat en vivo).
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, conversation?.conversationId]);

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
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="font-semibold">{titulo}</p>
        <p className="text-xs text-gray-500">Telegram · {conversation.total} mensajes</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3" data-testid="telegram-thread">
        {loading && messages.length === 0 ? (
          <p className="text-sm text-gray-500">Cargando mensajes…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-500">No hay mensajes todavía.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              data-direction={m.direction}
              className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  m.direction === 'out' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={`mt-1 text-[10px] ${m.direction === 'out' ? 'text-emerald-100' : 'text-gray-500'}`}>
                  {hhmm(m.createdAt)}
                  {m.direction === 'out' && m.providerMessageId == null ? ' · pendiente' : ''}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Escribe una respuesta"
            className="min-h-[42px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
