// Tests del hook del hilo del OPERADOR (Minion 3A) sobre /operator-chat/*.
// Mismo patrón que use-telegram-inbox.test.tsx: fake timers + mock de la capa API.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api/client';
import { useOperatorChat, type OperatorMessage } from '@/lib/hooks/use-operator-chat';

const MSG_ASSISTANT: OperatorMessage = {
  id: 'op-1', role: 'assistant', text: 'Todo en verde: 30/30 tests.', createdAt: '2026-07-06T09:00:00Z',
};

/** Responde /operator-chat/history con `messages` y rechaza /send salvo que se pise luego. */
function mockHistory(messages: OperatorMessage[]) {
  vi.mocked(apiFetch).mockImplementation(async (path: unknown) => {
    const p = String(path);
    if (p.startsWith('/operator-chat/history')) return { messages };
    if (p === '/operator-chat/send') return { accepted: true };
    throw new Error(`ruta no mockeada: ${p}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockHistory([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe('useOperatorChat', () => {
  it('carga el historial al montar cuando enabled=true', async () => {
    mockHistory([MSG_ASSISTANT]);
    const { result } = renderHook(() => useOperatorChat(true));
    await flush();

    expect(apiFetch).toHaveBeenCalledWith('/operator-chat/history?limit=50');
    expect(result.current.messages.map((m) => m.text)).toEqual(['Todo en verde: 30/30 tests.']);
  });

  it('no hace fetch si enabled=false', async () => {
    renderHook(() => useOperatorChat(false));
    await flush();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('vuelve a cargar el historial en cada poll (5s)', async () => {
    const { result } = renderHook(() => useOperatorChat(true));
    await flush();
    expect(result.current.messages).toEqual([]);

    mockHistory([MSG_ASSISTANT]);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(result.current.messages.map((m) => m.text)).toEqual(['Todo en verde: 30/30 tests.']);
  });

  it('inserta el mensaje propio de forma optimista antes de que resuelva el envío', async () => {
    let resolveSend!: () => void;
    vi.mocked(apiFetch).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.startsWith('/operator-chat/history')) return { messages: [] };
      if (p === '/operator-chat/send') {
        return new Promise((resolve) => { resolveSend = () => resolve({ accepted: true }); });
      }
      throw new Error(`ruta no mockeada: ${p}`);
    });

    const { result } = renderHook(() => useOperatorChat(true));
    await flush();

    let sendPromise!: Promise<void>;
    act(() => { sendPromise = result.current.send('Lanza el deploy de AA.'); });

    // El POST sigue en vuelo: la burbuja propia ya está en `messages` (como saliente).
    expect(result.current.messages.map((m) => m.text)).toEqual(['Lanza el deploy de AA.']);
    expect(result.current.messages[0].direction).toBe('out');

    resolveSend();
    await act(async () => { await sendPromise; });
  });

  it('reconcilia el pendiente cuando el historial recargado devuelve el turno confirmado', async () => {
    let resolveSend!: () => void;
    vi.mocked(apiFetch).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.startsWith('/operator-chat/history')) return { messages: [] };
      if (p === '/operator-chat/send') {
        return new Promise((resolve) => { resolveSend = () => resolve({ accepted: true }); });
      }
      throw new Error(`ruta no mockeada: ${p}`);
    });

    const { result } = renderHook(() => useOperatorChat(true));
    await flush();

    let sendPromise!: Promise<void>;
    act(() => { sendPromise = result.current.send('Lanza el deploy de AA.'); });
    expect(result.current.messages.map((m) => m.text)).toEqual(['Lanza el deploy de AA.']);

    // Tras resolver el POST, send() dispara un load() que ya ve el turno confirmado
    // (mismo texto, role user) en el historial del servidor.
    vi.mocked(apiFetch).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.startsWith('/operator-chat/history')) {
        return { messages: [{ id: 'srv-1', role: 'user', text: 'Lanza el deploy de AA.', createdAt: new Date().toISOString() }] };
      }
      throw new Error(`ruta no mockeada tras confirmar: ${p}`);
    });

    resolveSend();
    await act(async () => { await sendPromise; });
    await flush();

    // Sin duplicado: el optimista se retiró al aparecer el turno del servidor.
    expect(result.current.messages.map((m) => m.text)).toEqual(['Lanza el deploy de AA.']);
    expect(result.current.messages).toHaveLength(1);
  });

  it('retira el optimista y setea error si el envío falla', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.startsWith('/operator-chat/history')) return { messages: [] };
      if (p === '/operator-chat/send') throw new Error('fallo de red');
      throw new Error(`ruta no mockeada: ${p}`);
    });

    const { result } = renderHook(() => useOperatorChat(true));
    await flush();

    await act(async () => { await result.current.send('Lanza el deploy de AA.'); });

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBe('fallo de red');
  });
});
