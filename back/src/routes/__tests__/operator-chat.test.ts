// Unit tests del proxy de operator chat hacia OpenClaw (mirror de agents-agency):
// historial (archivo/docker exec) + envío al gateway. Runner: node --import tsx --test.
//
// Mismo criterio que telegram.test.ts: se invocan los handlers reales (sin supertest ni
// servidor real), con Request/Response simulados. operator-chat.ts no tiene capa de
// inyección de dependencias (a diferencia de telegram.ts), así que los handlers se
// extraen directamente del router ya montado (sin tocar el código de producción). El
// transcript se sustituye por OPENCLAW_OPERATOR_TRANSCRIPT_FILE (override que YA soporta
// el código real) para no depender de docker; el envío se prueba mockeando global.fetch.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { operatorChatRouter } from '../operator-chat.js';

// ── Helpers de req/res simulados (mismo patrón que telegram.test.ts) ─────────────
function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number; body?: unknown;
    status(code: number): typeof res; json(body: unknown): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}
function mockReq(opts: { query?: Record<string, unknown>; body?: unknown } = {}) {
  return { query: opts.query ?? {}, body: opts.body } as unknown as Request;
}

/** Extrae el handler real registrado en el router (sin refactorizar operator-chat.ts). */
function getHandler(method: 'get' | 'post', routePath: string) {
  const stack = (operatorChatRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: Request, res: Response) => unknown }> } }> }).stack;
  const layer = stack.find((l) => l.route?.path === routePath && l.route.methods[method]);
  if (!layer?.route) throw new Error(`handler no encontrado: ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void> | void;
}

const historyHandler = getHandler('get', '/history');
const sendHandler = getHandler('post', '/send');

// ── Entorno / fixtures de transcript (jsonl) ─────────────────────────────────────
const ENV_KEYS = [
  'OPENCLAW_OPERATOR_TRANSCRIPT_FILE',
  'OPENCLAW_GATEWAY_PASSWORD',
  'OPENCLAW_GATEWAY_TOKEN',
  'OPENCLAW_BASE_URL',
  'OPENCLAW_OPERATOR_SESSION_KEY',
] as const;

let tmpDir: string;
let transcriptFile: string;
let savedEnv: Record<string, string | undefined>;
let savedFetch: typeof fetch;

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  savedFetch = globalThis.fetch;
  tmpDir = await mkdtemp(path.join(tmpdir(), 'operator-chat-test-'));
  transcriptFile = path.join(tmpDir, 'transcript.jsonl');
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  globalThis.fetch = savedFetch;
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeTranscript(lines: unknown[]) {
  await writeFile(transcriptFile, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf8');
  process.env.OPENCLAW_OPERATOR_TRANSCRIPT_FILE = transcriptFile;
}

// ── GET /history ──────────────────────────────────────────────────────────────────
describe('GET /history', () => {
  test('normaliza entradas user/assistant', async () => {
    await writeTranscript([
      { type: 'message', message: { role: 'user', content: 'Hola', timestamp: 1735689600 } },
      { type: 'message', message: { role: 'assistant', content: 'Buenas', timestamp: 1735689660 } },
    ]);
    const res = mockRes();
    await historyHandler(mockReq(), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { messages: { role: string; text: string; createdAt: string | null }[] };
    assert.equal(body.messages.length, 2);
    assert.deepEqual(body.messages.map((m) => m.role), ['user', 'assistant']);
    assert.deepEqual(body.messages.map((m) => m.text), ['Hola', 'Buenas']);
    assert.ok(body.messages.every((m) => typeof m.createdAt === 'string'));
  });

  test('descarta mensajes sin contenido de texto', async () => {
    await writeTranscript([
      { type: 'message', message: { role: 'user', content: '' } },
      { type: 'message', message: { role: 'user', content: [] } },
      { type: 'message', message: { role: 'assistant', content: '   ' } },
      { type: 'message', message: { role: 'assistant', content: 'Visible' } },
    ]);
    const res = mockRes();
    await historyHandler(mockReq(), res);
    const body = res.body as { messages: { text: string }[] };
    assert.deepEqual(body.messages.map((m) => m.text), ['Visible']);
  });

  test('descarta ecos de delivery-mirror (flag en message, model y flag en raw)', async () => {
    await writeTranscript([
      { type: 'message', message: { role: 'assistant', content: 'eco-flag', openclawDeliveryMirror: true } },
      { type: 'message', message: { role: 'assistant', content: 'eco-modelo', model: 'delivery-mirror' } },
      { type: 'message', openclawDeliveryMirror: true, message: { role: 'assistant', content: 'eco-raw' } },
      { type: 'message', message: { role: 'assistant', content: 'Real' } },
    ]);
    const res = mockRes();
    await historyHandler(mockReq(), res);
    const body = res.body as { messages: { text: string }[] };
    assert.deepEqual(body.messages.map((m) => m.text), ['Real']);
  });

  test('respeta el query param limit', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ type: 'message', message: { role: 'user', content: `m${i}` } }));
    await writeTranscript(many);
    const res = mockRes();
    await historyHandler(mockReq({ query: { limit: '2' } }), res);
    const body = res.body as { messages: { text: string }[] };
    assert.deepEqual(body.messages.map((m) => m.text), ['m3', 'm4']);
  });

  test('acota limit por debajo del rango a 1 (valor negativo)', async () => {
    // Nota: '0' no sirve para probar este límite porque `Number(...) || 50` trata el 0
    // como ausente y cae al default (50); un negativo sí es truthy y llega a Math.max.
    const many = Array.from({ length: 3 }, (_, i) => ({ type: 'message', message: { role: 'user', content: `m${i}` } }));
    await writeTranscript(many);
    const res = mockRes();
    await historyHandler(mockReq({ query: { limit: '-5' } }), res);
    const body = res.body as { messages: { text: string }[] };
    assert.deepEqual(body.messages.map((m) => m.text), ['m2']);
  });

  test('acota limit por encima del rango a 200', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ type: 'message', message: { role: 'user', content: `m${i}` } }));
    await writeTranscript(many);
    const res = mockRes();
    await historyHandler(mockReq({ query: { limit: '9999' } }), res);
    const body = res.body as { messages: unknown[] };
    assert.equal(body.messages.length, 200);
  });

  test('502 si falla la lectura del transcript', async () => {
    process.env.OPENCLAW_OPERATOR_TRANSCRIPT_FILE = path.join(tmpDir, 'no-existe.jsonl');
    const res = mockRes();
    await historyHandler(mockReq(), res);
    assert.equal(res.statusCode, 502);
    assert.equal((res.body as { error: { code: string } }).error.code, 'openclaw_history_failed');
  });
});

// ── POST /send ─────────────────────────────────────────────────────────────────────
describe('POST /send', () => {
  test('422 si falta text', async () => {
    process.env.OPENCLAW_GATEWAY_PASSWORD = 'secret';
    const res = mockRes();
    await sendHandler(mockReq({ body: {} }), res);
    assert.equal(res.statusCode, 422);
  });

  test('503 si no hay OPENCLAW_GATEWAY_PASSWORD ni OPENCLAW_GATEWAY_TOKEN', async () => {
    delete process.env.OPENCLAW_GATEWAY_PASSWORD;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    const res = mockRes();
    await sendHandler(mockReq({ body: { text: 'Hola' } }), res);
    assert.equal(res.statusCode, 503);
  });

  test('202 con accepted=true y ecoa el clientMessageId recibido', async () => {
    process.env.OPENCLAW_GATEWAY_PASSWORD = 'secret';
    globalThis.fetch = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
    const res = mockRes();
    await sendHandler(mockReq({ body: { text: 'Hola', clientMessageId: 'ck-1' } }), res);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { accepted: true, clientMessageId: 'ck-1' });
  });

  test('502 si el fetch al gateway lanza', async () => {
    process.env.OPENCLAW_GATEWAY_PASSWORD = 'secret';
    globalThis.fetch = (async () => { throw new Error('red caída'); }) as unknown as typeof fetch;
    const res = mockRes();
    await sendHandler(mockReq({ body: { text: 'Hola' } }), res);
    assert.equal(res.statusCode, 502);
    assert.equal((res.body as { error: { code: string; message: string } }).error.code, 'openclaw_send_failed');
    assert.equal((res.body as { error: { message: string } }).error.message, 'OpenClaw rechazó el envío');
  });

  test('502 si el gateway responde !ok', async () => {
    process.env.OPENCLAW_GATEWAY_TOKEN = 'token-x';
    delete process.env.OPENCLAW_GATEWAY_PASSWORD;
    globalThis.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const res = mockRes();
    await sendHandler(mockReq({ body: { text: 'Hola' } }), res);
    assert.equal(res.statusCode, 502);
  });
});
