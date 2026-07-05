// UI tests del detalle de conversación de Telegram (crm-operaos WU5 / AC5).
// Componente presentacional → se prueba con render + fireEvent, sin mockear red.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { TelegramConversacion } from '@/components/crm/telegram-conversacion';
import type { TelegramConversationDto, TelegramMessageDto } from '@/lib/api/telegram';

afterEach(() => cleanup());

const CONV: TelegramConversationDto = {
  conversationId: 'chat-1', remitente: 'Ana', lastText: 'Hola', lastAt: '2026-07-05T10:00:00Z', total: 2,
};
const MSGS: TelegramMessageDto[] = [
  { id: 'a', conversationId: 'chat-1', direction: 'in', text: 'Hola, ¿tenéis hueco?', providerMessageId: 'tg-1', clientMessageId: null, remitente: 'Ana', createdAt: '2026-07-05T09:00:00Z' },
  { id: 'b', conversationId: 'chat-1', direction: 'out', text: 'Sí, mañana a las 10', providerMessageId: 'tg-2', clientMessageId: 'ck-1', remitente: null, createdAt: '2026-07-05T09:05:00Z' },
];

describe('TelegramConversacion', () => {
  it('muestra el hilo con mensajes entrantes y salientes diferenciados', () => {
    render(<TelegramConversacion conversation={CONV} messages={MSGS} onSend={vi.fn()} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Hola, ¿tenéis hueco?')).toBeInTheDocument();
    const thread = screen.getByTestId('telegram-thread');
    const bubbles = within(thread).getAllByText(/hueco|mañana/);
    expect(bubbles).toHaveLength(2);
    // La dirección se refleja en el data-direction del contenedor.
    const dirs = Array.from(thread.querySelectorAll('[data-direction]')).map((n) => n.getAttribute('data-direction'));
    expect(dirs).toEqual(['in', 'out']);
  });

  it('Responder llama a onSend con el texto escrito y limpia el campo', () => {
    const onSend = vi.fn();
    render(<TelegramConversacion conversation={CONV} messages={MSGS} onSend={onSend} />);
    const input = screen.getByLabelText('Escribe una respuesta') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Perfecto, os espero' } });
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }));
    expect(onSend).toHaveBeenCalledWith('Perfecto, os espero');
    expect(input.value).toBe('');
  });

  it('no envía cuando el texto está vacío o solo espacios', () => {
    const onSend = vi.fn();
    render(<TelegramConversacion conversation={CONV} messages={MSGS} onSend={onSend} />);
    const input = screen.getByLabelText('Escribe una respuesta');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sin conversación seleccionada muestra el estado vacío', () => {
    render(<TelegramConversacion conversation={null} messages={[]} onSend={vi.fn()} />);
    expect(screen.getByText('Sin conversación seleccionada')).toBeInTheDocument();
  });
});
