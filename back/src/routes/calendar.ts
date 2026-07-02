import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthedRequest } from '../middleware/types.js';
import { rateLimit, ipKey } from '../lib/rateLimit.js';
import {
  generateOrRegenerateToken,
  revokeCalendarToken,
  resolveTokenOwner,
  getCalendarTokenStatus,
} from '../lib/calendarToken.js';
import type { CalendarTokenRepo } from '../lib/calendarToken.js';
import { resolveFeedItems, feedRange } from '../lib/calendarFeed.js';
import type { CalendarFeedDeps } from '../lib/calendarFeed.js';
import { toICS } from '../lib/ics.js';

// ---------------------------------------------------------------------------
// crm-citas-google-calendar: feed ICS suscribible (público, token en la URL) +
// autoservicio del token/preferencia de push (autenticado). Montado en la sección
// "Público" de routes/index.ts — el feed no puede pasar por el gate de sesión
// (Google Calendar lo pide por URL, sin Bearer). Los endpoints de autoservicio
// llaman `authenticate` explícitamente, mismo patrón que /auth/profile.
// ---------------------------------------------------------------------------

export const calendarRouter = Router();

// Bucket propio (gotcha e2e: el reset de rate-limit debe escoparse por bucket,
// no global — ver crm-e2e-rate-limit-isolation). Generoso: Google/Outlook pollean
// el feed periódicamente y varios calendarios pueden compartir salida NAT.
const feedLimiter = rateLimit({ bucket: 'calendar-feed', windowMs: 60_000, max: 30, keyOf: ipKey });

// ---------------------------------------------------------------------------
// Repo Prisma del token (implementa el puerto CalendarTokenRepo — WU1.2).
// ---------------------------------------------------------------------------
const tokenRepo: CalendarTokenRepo = {
  async findByUserId(userId) {
    const row = await prisma.calendarToken.findUnique({ where: { userId } });
    return row ? { tokenHash: row.tokenHash, revokedAt: row.revokedAt } : null;
  },
  async upsert(userId, tokenHash, now) {
    await prisma.calendarToken.upsert({
      where: { userId },
      create: { userId, tokenHash },
      update: { tokenHash, revokedAt: null, regeneratedAt: now },
    });
  },
  async revoke(userId, now) {
    await prisma.calendarToken.updateMany({ where: { userId }, data: { revokedAt: now } });
  },
  async findActiveOwnerByHash(tokenHash) {
    const row = await prisma.calendarToken.findFirst({
      where: { tokenHash, revokedAt: null },
      select: { userId: true },
    });
    return row ? { userId: row.userId } : null;
  },
};

// ---------------------------------------------------------------------------
// Deps Prisma del feed (implementa el puerto CalendarFeedDeps — WU2.2).
// Scoping por usuario: Employee.userId (1 empleado por usuario, @unique) para
// citas; Reminder.responsableId para recordatorios. Sin filtro extra de negocio:
// ambas relaciones ya son intrínsecamente de UN solo negocio (Employee.userId es
// único, así que no hay ambigüedad cross-tenant).
// ---------------------------------------------------------------------------
const feedDeps: CalendarFeedDeps = {
  async findBookingsForUser(userId, range) {
    const rows = await prisma.booking.findMany({
      where: {
        employee: { userId },
        eliminadoEn: null,
        status: { notIn: ['CANCELLED'] },
        startAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true, startAt: true, endAt: true,
        service: { select: { nombre: true } },
        customer: { select: { nombre: true, apellido: true } },
        location: { select: { direccion: true } },
      },
    });
    return rows;
  },
  async findRemindersForUser(userId, range) {
    const rows = await prisma.reminder.findMany({
      where: {
        responsableId: userId,
        eliminadoEn: null,
        estado: { not: 'CANCELLED' },
        fechaPrevista: { gte: range.from, lte: range.to },
      },
      select: {
        id: true, titulo: true, fechaPrevista: true,
        customer: { select: { nombre: true, apellido: true, direccion: true } },
      },
    });
    return rows;
  },
};

// ---------------------------------------------------------------------------
// GET /calendar/feed/:token.ics — PÚBLICO. Token opaco en la URL (no sesión).
// 404 opaco (AC2): token inexistente y token revocado responden EXACTAMENTE igual,
// sin filtrar si "alguna vez existió".
// ---------------------------------------------------------------------------
calendarRouter.get('/feed/:token.ics', feedLimiter, async (req, res: Response) => {
  const rawToken = req.params.token;
  const userId = await resolveTokenOwner(tokenRepo, rawToken);
  if (!userId) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Feed no encontrado' } });
  }

  const items = await resolveFeedItems(feedDeps, userId, feedRange());
  const ics = toICS(items);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="crm.ics"');
  res.status(200).send(ics);
});

// ---------------------------------------------------------------------------
// Autoservicio (requiere sesión). El usuario solo gestiona SU PROPIO token —
// req.userId de la sesión, igual que /auth/profile.
// ---------------------------------------------------------------------------

// GET /calendar/status — estado para pintar la sección "Calendario" en Mi Cuenta,
// sin exponer el valor en claro del token.
calendarRouter.get('/status', authenticate, async (req: AuthedRequest, res) => {
  const [tokenStatus, user] = await Promise.all([
    getCalendarTokenStatus(tokenRepo, req.userId!),
    prisma.user.findUnique({ where: { id: req.userId! }, select: { calendarPushEnabled: true } }),
  ]);
  res.json({ hasToken: tokenStatus.hasToken, pushEnabled: user?.calendarPushEnabled ?? false });
});

// POST /calendar/token — genera (o regenera) el token del feed. El valor en claro
// se devuelve SOLO en esta respuesta; nunca más se puede recuperar (AC7).
calendarRouter.post('/token', authenticate, async (req: AuthedRequest, res) => {
  const result = await generateOrRegenerateToken(tokenRepo, req.userId!);
  res.status(201).json({
    token: result.token,
    // Ruta relativa; el front antepone su NEXT_PUBLIC_API_URL + /api (apiFetch).
    path: `/calendar/feed/${result.token}.ics`,
    regenerated: result.regenerated,
  });
});

// DELETE /calendar/token — revoca. El feed queda muerto al instante (AC2).
calendarRouter.delete('/token', authenticate, async (req: AuthedRequest, res) => {
  await revokeCalendarToken(tokenRepo, req.userId!);
  res.status(204).end();
});

// PATCH /calendar/preferences — toggle "enviar citas confirmadas a mi calendario".
const preferencesSchema = z.object({ pushEnabled: z.boolean() });

calendarRouter.patch('/preferences', authenticate, async (req: AuthedRequest, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  }
  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { calendarPushEnabled: parsed.data.pushEnabled },
    select: { calendarPushEnabled: true },
  });
  res.json({ pushEnabled: user.calendarPushEnabled });
});
