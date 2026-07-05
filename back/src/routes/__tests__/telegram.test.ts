// Unit tests de la Telegram UI (crm-operaos WU5): webhook de entrada + UI de
// conversaciones + respuesta manual con idempotencia. Runner: node --import tsx --test
//
// Mismo patrón DI que service-operator-write-ops.test.ts: BD y sender inyectados como
// dobles, sin levantar servidor ni BD real. El middleware de token (webhook) y el gate
// authenticate+staffOnly (UI) se ejercitan en sus propias suites; aquí se prueban los
// handlers directamente.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  webhookHandler,
  conversationsHandler,
  messagesHandler,
  replyHandler,
  type TelegramDb,
  type TelegramRow,
  type TelegramSender,
} from '../telegram.js';
import type { AuthedRequest } from '../../middleware/types.js';

// ── Helpers de req/res simulados ───────────────────────────────────────────────
function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number; body?: unknown;
    status(code: number): typeof res; json(body: unknown): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}
function mockReq(opts: { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown } = {}) {
  return { params: opts.params ?? {}, query: opts.query ?? {}, body: opts.body } as unknown as Request;
}
function mockAuthedReq(opts: { businessId?: string; params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown } = {}) {
  return { businessId: opts.businessId ?? ACTIVE_BUSINESS, params: opts.params ?? {}, query: opts.query ?? {}, body: opts.body } as unknown as AuthedRequest;
}

const ACTIVE_BUSINESS = 'biz-1';
const now = new Date('2026-07-05T10:00:00Z');

function row(over: Partial<TelegramRow> = {}): TelegramRow {
  return {
    id: 'm1', conversationId: 'chat-1', direction: 'in', text: 'Hola',
    providerMessageId: null, clientMessageId: null, remitente: 'Ana', createdAt: now, ...over,
  };
}

/** Doble mínimo de TelegramDb, configurable por test. */
function fakeDb(over: Partial<TelegramDb> = {}): TelegramDb {
  return {
    business: { findFirst: async ({ where }) => (where.id === ACTIVE_BUSINESS ? { id: ACTIVE_BUSINESS } : null) },
    telegramMessage: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async (args) => row({ ...(args.data as Partial<TelegramRow>), id: 'created' }),
      update: async (args) => row({ id: args.where.id, ...(args.data as Partial<TelegramRow>) }),
    },
    conversations: async () => [],
    ...over,
  };
}

const noopSender: TelegramSender = { send: async () => ({}) };

// ── POST /webhook (entrada) ─────────────────────────────────────────────────────
describe('webhookHandler', () => {
  test('201: persiste el entrante como direction=in', async () => {
    let created: Record<string, unknown> | undefined;
    const db = fakeDb({
      telegramMessage: { ...fakeDb().telegramMessage, create: async (a) => { created = a.data; return row({ ...(a.data as Partial<TelegramRow>), id: 'new' }); } },
    });
    const res = mockRes();
    await webhookHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, conversationId: 'chat-1', text: 'Hola', providerMessageId: 'tg-9', remitente: 'Ana' } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(created?.direction, 'in');
    assert.equal(created?.providerMessageId, 'tg-9');
    assert.equal((res.body as { direction: string }).direction, 'in');
  });

  test('200: idempotente por providerMessageId (no duplica)', async () => {
    let createCalls = 0;
    const existing = row({ id: 'dup', providerMessageId: 'tg-9' });
    const db = fakeDb({
      telegramMessage: {
        ...fakeDb().telegramMessage,
        findFirst: async ({ where }) => (where.providerMessageId === 'tg-9' ? existing : null),
        create: async (a) => { createCalls++; return row(a.data as Partial<TelegramRow>); },
      },
    });
    const res = mockRes();
    await webhookHandler(db, mockReq({ body: { businessId: ACTIVE_BUSINESS, conversationId: 'chat-1', text: 'Hola', providerMessageId: 'tg-9' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(createCalls, 0, 'no debe crear si ya existe el providerMessageId');
    assert.equal((res.body as { id: string }).id, 'dup');
  });

  test('422 si falta text', async () => {
    const res = mockRes();
    await webhookHandler(fakeDb(), mockReq({ body: { businessId: ACTIVE_BUSINESS, conversationId: 'chat-1' } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('404 si el negocio no existe o está inactivo', async () => {
    const res = mockRes();
    await webhookHandler(fakeDb(), mockReq({ body: { businessId: 'nope', conversationId: 'chat-1', text: 'Hola' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'business_not_found');
  });
});

// ── GET /conversations (UI) ──────────────────────────────────────────────────────
describe('conversationsHandler', () => {
  test('200: mapea el resumen con fechas ISO', async () => {
    const db = fakeDb({ conversations: async () => [{ conversationId: 'chat-1', remitente: 'Ana', lastText: 'Hola', lastAt: now, total: 3 }] });
    const res = mockRes();
    await conversationsHandler(db, mockAuthedReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { conversations: [{ conversationId: 'chat-1', remitente: 'Ana', lastText: 'Hola', lastAt: now.toISOString(), total: 3 }] });
  });
});

// ── GET /conversations/:id/messages (UI) ─────────────────────────────────────────
describe('messagesHandler', () => {
  test('200: devuelve en orden cronológico ascendente y hasMore=false', async () => {
    const older = row({ id: 'a', createdAt: new Date('2026-07-05T09:00:00Z') });
    const newer = row({ id: 'b', createdAt: new Date('2026-07-05T10:00:00Z') });
    // El handler pide desc; devolvemos desc y esperamos que reinvierta a asc.
    const db = fakeDb({ telegramMessage: { ...fakeDb().telegramMessage, findMany: async () => [newer, older] } });
    const res = mockRes();
    await messagesHandler(db, mockAuthedReq({ params: { conversationId: 'chat-1' } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { items: { id: string }[]; hasMore: boolean };
    assert.deepEqual(body.items.map((m) => m.id), ['a', 'b']);
    assert.equal(body.hasMore, false);
  });

  test('200: hasMore=true cuando hay más que el limit', async () => {
    const many = Array.from({ length: 51 }, (_, i) => row({ id: `m${i}`, createdAt: new Date(now.getTime() - i * 1000) }));
    const db = fakeDb({ telegramMessage: { ...fakeDb().telegramMessage, findMany: async () => many } });
    const res = mockRes();
    await messagesHandler(db, mockAuthedReq({ params: { conversationId: 'chat-1' } }), res);
    const body = res.body as { items: unknown[]; hasMore: boolean };
    assert.equal(body.hasMore, true);
    assert.equal(body.items.length, 50);
  });

  test('422 si falta conversationId', async () => {
    const res = mockRes();
    await messagesHandler(fakeDb(), mockAuthedReq({ params: {} }), res);
    assert.equal(res.statusCode, 422);
  });
});

// ── POST /conversations/:id/reply (UI + envío) ───────────────────────────────────
describe('replyHandler', () => {
  test('201: persiste out, reenvía y marca sent=true con providerMessageId', async () => {
    let created: Record<string, unknown> | undefined;
    let updatedWith: Record<string, unknown> | undefined;
    const db = fakeDb({
      telegramMessage: {
        ...fakeDb().telegramMessage,
        create: async (a) => { created = a.data; return row({ ...(a.data as Partial<TelegramRow>), id: 'out-1' }); },
        update: async (a) => { updatedWith = a.data; return row({ id: a.where.id, direction: 'out', ...(a.data as Partial<TelegramRow>) }); },
      },
    });
    const sender: TelegramSender = { send: async () => ({ providerMessageId: 'tg-out-99' }) };
    const res = mockRes();
    await replyHandler(db, sender, mockAuthedReq({ params: { conversationId: 'chat-1' }, body: { text: 'Buenas', clientMessageId: 'ck-1' } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(created?.direction, 'out');
    assert.equal(updatedWith?.providerMessageId, 'tg-out-99');
    assert.equal((res.body as { sent: boolean }).sent, true);
  });

  test('201: sent=false si el proveedor no devuelve providerMessageId (mensaje igualmente persistido)', async () => {
    const res = mockRes();
    await replyHandler(fakeDb(), noopSender, mockAuthedReq({ params: { conversationId: 'chat-1' }, body: { text: 'Buenas' } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal((res.body as { sent: boolean }).sent, false);
  });

  test('201: el mensaje se persiste aunque el envío lance (best-effort, no se pierde)', async () => {
    let createCalls = 0;
    const db = fakeDb({ telegramMessage: { ...fakeDb().telegramMessage, create: async (a) => { createCalls++; return row({ ...(a.data as Partial<TelegramRow>), id: 'out-2' }); } } });
    const throwingSender: TelegramSender = { send: async () => { throw new Error('proveedor caído'); } };
    const res = mockRes();
    await replyHandler(db, throwingSender, mockAuthedReq({ params: { conversationId: 'chat-1' }, body: { text: 'Buenas' } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(createCalls, 1, 'el saliente debe quedar persistido antes del envío');
    assert.equal((res.body as { sent: boolean }).sent, false);
  });

  test('200: idempotente por clientMessageId (no reenvía ni recrea)', async () => {
    let createCalls = 0; let sendCalls = 0;
    const existing = row({ id: 'out-prev', direction: 'out', clientMessageId: 'ck-9', providerMessageId: 'tg-prev' });
    const db = fakeDb({
      telegramMessage: {
        ...fakeDb().telegramMessage,
        findFirst: async ({ where }) => (where.clientMessageId === 'ck-9' ? existing : null),
        create: async (a) => { createCalls++; return row(a.data as Partial<TelegramRow>); },
      },
    });
    const sender: TelegramSender = { send: async () => { sendCalls++; return { providerMessageId: 'x' }; } };
    const res = mockRes();
    await replyHandler(db, sender, mockAuthedReq({ params: { conversationId: 'chat-1' }, body: { text: 'Buenas', clientMessageId: 'ck-9' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(createCalls, 0);
    assert.equal(sendCalls, 0);
    assert.equal((res.body as { message: { id: string }; sent: boolean }).message.id, 'out-prev');
    assert.equal((res.body as { sent: boolean }).sent, true);
  });

  test('422 si falta text', async () => {
    const res = mockRes();
    await replyHandler(fakeDb(), noopSender, mockAuthedReq({ params: { conversationId: 'chat-1' }, body: {} }), res);
    assert.equal(res.statusCode, 422);
  });
});
