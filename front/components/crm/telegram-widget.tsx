'use client';
import { useState } from 'react';
import { MessageCircle, X, ArrowLeft } from 'lucide-react';
import { isApiEnabled } from '@/lib/api/client';
import { EmptyState } from '@/components/ui/primitives';
import { MinionIcon } from '@/components/ui/minion-icon';
import { TelegramConversacion } from '@/components/crm/telegram-conversacion';
import { useTelegramInbox } from '@/lib/hooks/use-telegram-inbox';
import { useOperatorChat } from '@/lib/hooks/use-operator-chat';

// Widget flotante persistente de "Minion" (canal Telegram por debajo): chip fijo
// abajo-derecha visible en toda la consola. Al pulsarlo abre/cierra un panel de chat
// (lista de conversaciones → hilo, patrón móvil) sin navegar. La orquestación
// (polling + envío) vive en useTelegramInbox y solo corre mientras el panel está abierto.

export function TelegramWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'operator' | 'list' | 'thread'>('list');
  const apiEnabled = isApiEnabled();

  const {
    conversations, activeId, setActiveId, messages, active,
    loadingThread, sending, error, handleSend,
  } = useTelegramInbox(apiEnabled && open && view !== 'operator');
  const operator = useOperatorChat(apiEnabled && open && view === 'operator');

  function openConversation(id: string) {
    setActiveId(id);
    setView('thread');
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Conversaciones de Minion"
          data-testid="telegram-widget-panel"
          className="fixed bottom-24 right-5 z-50 flex h-[70vh] max-h-[560px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel-card)] text-[var(--panel-text)] shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--acc)] px-4 py-3 text-[var(--panel-bg)]">
            <div className="flex min-w-0 items-center gap-2">
              {view === 'thread' && (
                <button
                  onClick={() => setView('list')}
                  aria-label="Volver a la lista"
                  className="rounded p-1 hover:bg-current/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <MinionIcon className="h-5 w-5 shrink-0" />
              <span className="truncate font-semibold">
                {view === 'operator' ? 'OpenClaw @Estudio3ABot' : view === 'thread' && active ? (active.remitente || active.conversationId) : 'Minion'}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar panel de Minion"
              className="rounded p-1 hover:bg-current/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex border-b border-[var(--line)] text-sm">
            <button
              onClick={() => setView('operator')}
              className={`flex-1 px-3 py-2 transition-colors ${
                view === 'operator'
                  ? 'bg-[var(--hover-bg)] font-semibold text-[var(--hover-text)]'
                  : 'text-[var(--panel-muted)] hover:text-[var(--panel-text)]'
              }`}
            >
              OpenClaw
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex-1 px-3 py-2 transition-colors ${
                view !== 'operator'
                  ? 'bg-[var(--hover-bg)] font-semibold text-[var(--hover-text)]'
                  : 'text-[var(--panel-muted)] hover:text-[var(--panel-text)]'
              }`}
            >
              CRM
            </button>
          </div>

          <div className="min-h-0 flex-1">
            {!apiEnabled ? (
              <div className="p-6">
                <EmptyState title="API no configurada" hint="Configura NEXT_PUBLIC_API_URL para ver las conversaciones." />
              </div>
            ) : error && conversations.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No se pudo cargar" hint={error} />
              </div>
            ) : view === 'operator' ? (
              <TelegramConversacion isOperatorTab conversation={operator.conversation} messages={operator.messages} loading={operator.loading} sending={operator.sending} onSend={operator.send} />
            ) : view === 'list' ? (
              <div className="h-full overflow-y-auto" data-testid="telegram-widget-conversations">
                {conversations.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="Sin conversaciones" hint="Aún no ha llegado ningún mensaje." />
                  </div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.conversationId}
                      onClick={() => openConversation(c.conversationId)}
                      className="flex w-full items-start gap-2 border-b border-gray-100 px-4 py-3 text-left hover:bg-[var(--hover-bg)] dark:border-white/5"
                    >
                      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--acc)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.remitente || c.conversationId}</span>
                        <span className="block truncate text-xs text-gray-500">{c.lastText}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <TelegramConversacion
                conversation={active}
                messages={messages}
                loading={loadingThread}
                sending={sending}
                onSend={handleSend}
              />
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar Minion' : 'Abrir Minion'}
        aria-expanded={open}
        data-testid="telegram-widget-chip"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--acc)] text-[var(--panel-bg)] shadow-lg transition hover:bg-[var(--acc-light)] focus:outline-none focus:ring-2 focus:ring-[var(--acc)] focus:ring-offset-2"
      >
        {open ? <X className="h-6 w-6" /> : <MinionIcon className="h-7 w-7" />}
      </button>
    </>
  );
}
