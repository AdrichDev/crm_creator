'use client';
import { MessageCircle } from 'lucide-react';
import { PageHeader, Card, EmptyState } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import { TelegramConversacion } from '@/components/crm/telegram-conversacion';
import { useTelegramInbox } from '@/lib/hooks/use-telegram-inbox';

// Minion UI (canal Telegram; crm-operaos WU5 / AC5): vista de página a pantalla completa.
// El acceso principal es el widget flotante persistente (TelegramWidget), montado globalmente
// en el root layout vía MinionWidgetGlobal; esta página queda como fallback para navegación
// directa a /telegram. Comparte la orquestación (polling + envío) vía useTelegramInbox.

export default function Page() {
  const apiEnabled = isApiEnabled();
  const {
    conversations, activeId, setActiveId, messages, active,
    loadingThread, sending, error, handleSend,
  } = useTelegramInbox(apiEnabled);

  return (
    <div>
      <PageHeader title="Minion" subtitle="Conversaciones del negocio en directo. Responde sin salir de OperaOS." />

      {!apiEnabled ? (
        <Card><div className="p-6"><EmptyState title="API no configurada" hint="Configura NEXT_PUBLIC_API_URL para ver las conversaciones de Minion." /></div></Card>
      ) : (
        <>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
            <Card>
              <div className="max-h-[70vh] overflow-y-auto" data-testid="telegram-conversations">
                {conversations.length === 0 ? (
                  <div className="p-6"><EmptyState title="Sin conversaciones" hint="Aún no ha llegado ningún mensaje." /></div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.conversationId}
                      onClick={() => setActiveId(c.conversationId)}
                      className={`flex w-full items-start gap-2 border-b border-gray-100 px-4 py-3 text-left hover:bg-[var(--hover-bg)] ${
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
