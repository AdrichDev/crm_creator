import { Router, type Request, type Response } from 'express';
import { Prisma } from '../lib/generated/prisma/client.js';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { staffOnly } from '../middleware/rbac.js';
import { requireOperatorToken } from '../middleware/operator-token.js';
import type { AuthedRequest } from '../middleware/types.js';

// ---------------------------------------------------------------------------
// Telegram UI (crm-operaos WU5) — lado creador_CRM.
//
// El bot real de Telegram vive en OpenClaw y llama al CRM por API (mcp-plataforma).
// Este módulo aporta DOS superficies sobre la misma tabla `mensaje_telegram`:
//
//   1. WEBHOOK (token-only, businessId EXPLÍCITO en el body): OpenClaw reenvía cada
//      mensaje ENTRANTE → se persiste como direction='in'. Idempotente por
//      providerMessageId (message_id de Telegram): un reintento del webhook no
//      duplica el mensaje. Montado FUERA de /api, protegido por x-service-token.
//
//   2. UI (sesión de usuario, businessId del token): staff de OperaOS lista las
//      conversaciones del tenant, abre una y responde. La respuesta se persiste como
//      direction='out' (idempotente por clientMessageId generado en el front) y se
//      reenvía al proveedor (mcp-plataforma). El envío es best-effort: si falla, el
//      mensaje queda persistido igualmente (no se pierde) y se puede reintentar.
//
// direction es String ('in'|'out') para calzar con el contrato del diseño sin enum
// nuevo (mismo criterio que Reminder.origen).
// ---------------------------------------------------------------------------

/** Mensaje tal como se expone a la UI (fechas serializadas por el handler). */
export type TelegramRow = {
  id: string;
  conversationId: string;
  direction: string;
  text: string;
  providerMessageId: string | null;
  clientMessageId: string | null;
  remitente: string | null;
  createdAt: Date;
};

/** Resumen de una conversación (última línea + total) para el listado lateral. */
export type ConversationSummary = {
  conversationId: string;
  remitente: string | null;
  lastText: string;
  lastAt: Date;
  total: number;
};

/**
 * Dependencias de BD del módulo. Interfaz estrecha (mismo patrón DI que
 * OperatorWriteDb en service-operator.ts): Prisma la satisface estructuralmente y
 * los tests inyectan un doble sin BD real.
 */
export interface TelegramDb {
  business: {
    findFirst(args: { where: { id: string; eliminadoEn: null } }): Promise<{ id: string } | null>;
  };
  telegramMessage: {
    findFirst(args: { where: Record<string, unknown> }): Promise<TelegramRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: { createdAt: 'asc' | 'desc' };
      take: number;
    }): Promise<TelegramRow[]>;
    create(args: { data: Record<string, unknown> }): Promise<TelegramRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<TelegramRow>;
  };
  /** Agregación de conversaciones (última línea + total) por negocio. */
  conversations(businessId: string): Promise<ConversationSummary[]>;
}

/** Proveedor de envío saliente (mcp-plataforma). Devuelve el id del proveedor si lo hay. */
export interface TelegramSender {
  send(input: { businessId: string; conversationId: string; text: string; clientMessageId?: string | null }): Promise<{ providerMessageId?: string }>;
}

const serialize = (r: TelegramRow) => ({ ...r, createdAt: r.createdAt.toISOString() });

/* ---------- POST /webhook (token-only, ENTRADA) ---------- */

/**
 * Ingesta de un mensaje entrante reenviado por OpenClaw. businessId explícito en el
 * body (no hay sesión). Idempotente por providerMessageId: si ese message_id ya está
 * persistido para el negocio → devuelve el existente (200) en vez de duplicarlo.
 */
export async function webhookHandler(db: TelegramDb, req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as {
      businessId?: unknown; conversationId?: unknown; text?: unknown;
      providerMessageId?: unknown; clientMessageId?: unknown; remitente?: unknown; direction?: unknown;
    };
    const businessId = typeof body.businessId === 'string' ? body.businessId : '';
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
    const text = typeof body.text === 'string' ? body.text : '';
    if (!businessId || !conversationId || !text.trim()) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta businessId, conversationId o text' } });
    }
    const business = await db.business.findFirst({ where: { id: businessId, eliminadoEn: null } });
    if (!business) return res.status(404).json({ error: { code: 'business_not_found', message: 'Negocio no encontrado o inactivo' } });

    const providerMessageId = typeof body.providerMessageId === 'string' && body.providerMessageId ? body.providerMessageId : null;
    const clientMessageId = typeof body.clientMessageId === 'string' && body.clientMessageId ? body.clientMessageId : null;
    const direction = body.direction === 'out' ? 'out' : 'in';
    const remitente = typeof body.remitente === 'string' && body.remitente ? body.remitente : null;

    // Idempotencia de entrada: mismo (negocio, providerMessageId) → no duplicar.
    if (providerMessageId) {
      const dup = await db.telegramMessage.findFirst({ where: { businessId, providerMessageId } });
      if (dup) return res.status(200).json(serialize(dup));
    }

    const row = await db.telegramMessage.create({
      data: { businessId, conversationId, direction: 'in', text, providerMessageId, remitente },
    });
    return res.status(201).json(serialize(row));
  } catch (e) {
    console.error('[telegram] error en webhook:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'No se pudo registrar el mensaje' } });
  }
}

/* ---------- GET /conversations (UI) ---------- */

/** Lista de conversaciones del tenant activo (businessId de la sesión). */
export async function conversationsHandler(db: TelegramDb, req: AuthedRequest, res: Response) {
  try {
    const businessId = req.businessId!;
    const rows = await db.conversations(businessId);
    res.json({
      conversations: rows.map((c) => ({
        conversationId: c.conversationId,
        remitente: c.remitente,
        lastText: c.lastText,
        lastAt: c.lastAt.toISOString(),
        total: c.total,
      })),
    });
  } catch (e) {
    console.error('[telegram] error listando conversaciones:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar las conversaciones' } });
  }
}

/* ---------- GET /conversations/:conversationId/messages (UI) ---------- */

const PAGE_LIMIT = 50;

/**
 * Mensajes de una conversación en orden cronológico (asc) para pintarla como chat.
 * Paginación hacia atrás por cursor `before` (ISO de createdAt): se piden los `limit`
 * más recientes anteriores al cursor y se devuelven en asc. `hasMore` indica si hay
 * más historia por cargar.
 */
export async function messagesHandler(db: TelegramDb, req: AuthedRequest, res: Response) {
  try {
    const businessId = req.businessId!;
    const conversationId = String(req.params.conversationId ?? '');
    if (!conversationId) return res.status(422).json({ error: { code: 'invalid', message: 'Falta conversationId' } });
    const q = req.query as Record<string, unknown>;
    const rawLimit = Number(q.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, PAGE_LIMIT) : PAGE_LIMIT;
    const where: Record<string, unknown> = { businessId, conversationId };
    if (typeof q.before === 'string' && q.before) {
      const before = new Date(q.before);
      if (!Number.isNaN(before.getTime())) where.createdAt = { lt: before };
    }
    // Pedimos limit+1 en desc para saber si hay más, luego reinvertimos a asc.
    const rows = await db.telegramMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit + 1 });
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).slice().reverse();
    res.json({ items: page.map(serialize), hasMore });
  } catch (e) {
    console.error('[telegram] error listando mensajes:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar los mensajes' } });
  }
}

/* ---------- POST /conversations/:conversationId/reply (UI + envío) ---------- */

/**
 * Respuesta manual desde OperaOS. Persiste el saliente (direction='out') y lo reenvía
 * al proveedor. Idempotencia por clientMessageId (clave del front): un doble submit
 * devuelve el mensaje ya creado (200) SIN reenviar. El envío es best-effort: si el
 * proveedor falla, el mensaje queda persistido (no se pierde) y `sent=false`.
 */
export async function replyHandler(db: TelegramDb, sender: TelegramSender, req: AuthedRequest, res: Response) {
  try {
    const businessId = req.businessId!;
    const conversationId = String(req.params.conversationId ?? '');
    const body = (req.body ?? {}) as { text?: unknown; clientMessageId?: unknown };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const clientMessageId = typeof body.clientMessageId === 'string' && body.clientMessageId ? body.clientMessageId : null;
    if (!conversationId) return res.status(422).json({ error: { code: 'invalid', message: 'Falta conversationId' } });
    if (!text) return res.status(422).json({ error: { code: 'invalid', message: 'Falta text' } });

    // Idempotencia de salida: mismo (negocio, clientMessageId) → devolver el existente.
    if (clientMessageId) {
      const dup = await db.telegramMessage.findFirst({ where: { businessId, clientMessageId } });
      if (dup) return res.status(200).json({ message: serialize(dup), sent: dup.providerMessageId != null });
    }

    // Persistir ANTES de enviar: si el envío falla, el mensaje no se pierde.
    const row = await db.telegramMessage.create({
      data: { businessId, conversationId, direction: 'out', text, clientMessageId, providerMessageId: null },
    });

    // Reenvío best-effort al proveedor (mcp-plataforma). Nunca tumba la respuesta.
    let sent = false;
    try {
      const result = await sender.send({ businessId, conversationId, text, clientMessageId });
      if (result.providerMessageId) {
        const updated = await db.telegramMessage.update({
          where: { id: row.id }, data: { providerMessageId: result.providerMessageId },
        });
        return res.status(201).json({ message: serialize(updated), sent: true });
      }
      sent = false;
    } catch (err) {
      console.error('[telegram] error reenviando al proveedor:', (err as Error).message);
      sent = false;
    }
    return res.status(201).json({ message: serialize(row), sent });
  } catch (e) {
    console.error('[telegram] error respondiendo:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'No se pudo enviar la respuesta' } });
  }
}

/* ---------- Deps reales ---------- */

/** Fila cruda de la agregación de conversaciones (aliases camelCase desde el SQL). */
type ConversationJoinRow = { conversationId: string; remitente: string | null; lastText: string; lastAt: Date; total: number | bigint };

const telegramDb: TelegramDb = {
  business: {
    findFirst: (args) => prisma.business.findFirst({ where: args.where, select: { id: true } }),
  },
  telegramMessage: {
    findFirst: (args) => prisma.telegramMessage.findFirst(args as unknown as Prisma.TelegramMessageFindFirstArgs) as unknown as Promise<TelegramRow | null>,
    findMany: (args) => prisma.telegramMessage.findMany(args as unknown as Prisma.TelegramMessageFindManyArgs) as unknown as Promise<TelegramRow[]>,
    create: (args) => prisma.telegramMessage.create({ data: args.data as unknown as Prisma.TelegramMessageUncheckedCreateInput }) as unknown as Promise<TelegramRow>,
    update: (args) => prisma.telegramMessage.update(args as unknown as Prisma.TelegramMessageUpdateArgs) as unknown as Promise<TelegramRow>,
  },
  // Última línea por conversación (DISTINCT ON) + total y un remitente representativo
  // (MAX no nulo). Ordenado por actividad reciente. SQL crudo: agregación por grupo.
  conversations: async (businessId) => {
    const rows = await prisma.$queryRaw<ConversationJoinRow[]>`
      SELECT last.conversacion_id AS "conversationId",
             agg.remitente        AS "remitente",
             last.texto           AS "lastText",
             last.creado_en       AS "lastAt",
             agg.total            AS "total"
      FROM (
        SELECT DISTINCT ON (conversacion_id) conversacion_id, texto, creado_en
        FROM crm.mensaje_telegram
        WHERE negocio_id = ${businessId}
        ORDER BY conversacion_id, creado_en DESC
      ) last
      JOIN (
        SELECT conversacion_id, COUNT(*)::int AS total, MAX(remitente) AS remitente
        FROM crm.mensaje_telegram
        WHERE negocio_id = ${businessId}
        GROUP BY conversacion_id
      ) agg ON agg.conversacion_id = last.conversacion_id
      ORDER BY last.creado_en DESC
    `;
    return rows.map((r) => ({
      conversationId: r.conversationId,
      remitente: r.remitente,
      lastText: r.lastText,
      lastAt: r.lastAt,
      total: Number(r.total),
    }));
  },
};

/**
 * Envío real al proveedor (mcp-plataforma) por HTTP. Env-gated: sin TELEGRAM_SEND_URL
 * el envío es un no-op silencioso (el mensaje ya quedó persistido). Autenticado con el
 * mismo service token del operador. Best-effort: los errores los absorbe replyHandler.
 */
const telegramSender: TelegramSender = {
  send: async ({ businessId, conversationId, text, clientMessageId }) => {
    const url = process.env.TELEGRAM_SEND_URL ?? '';
    const token = process.env.OPERATOR_SERVICE_TOKEN ?? '';
    if (!url) return {};
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-token': token },
      body: JSON.stringify({ businessId, conversationId, text, clientMessageId }),
    });
    if (!resp.ok) throw new Error(`proveedor respondió ${resp.status}`);
    const data = (await resp.json().catch(() => ({}))) as { providerMessageId?: unknown; messageId?: unknown };
    const pid = data.providerMessageId ?? data.messageId;
    return { providerMessageId: typeof pid === 'string' ? pid : pid != null ? String(pid) : undefined };
  },
};

/* ---------- Routers ---------- */

// UI: sesión de usuario + staff. Montado en /api/telegram (ver routes/index.ts).
export const telegramRouter = Router();
telegramRouter.get('/conversations', (req: AuthedRequest, res) => conversationsHandler(telegramDb, req, res));
telegramRouter.get('/conversations/:conversationId/messages', (req: AuthedRequest, res) => messagesHandler(telegramDb, req, res));
telegramRouter.post('/conversations/:conversationId/reply', (req: AuthedRequest, res) => replyHandler(telegramDb, telegramSender, req, res));

// Webhook: token-only. Montado en /service/operator/telegram (ver server.ts).
export const telegramWebhookRouter = Router();
telegramWebhookRouter.use(requireOperatorToken());
telegramWebhookRouter.post('/', (req, res) => webhookHandler(telegramDb, req, res));
telegramWebhookRouter.post('/webhook', (req, res) => webhookHandler(telegramDb, req, res));

// Reexport de middleware para que index.ts monte la UI tras authenticate+staffOnly
// con el mismo criterio que el resto de rutas de gestión.
export { authenticate, staffOnly };
