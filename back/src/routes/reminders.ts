import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { pickFields, joinNombre } from '../lib/nombre.js';
import { maybePushCalendarEvent } from '../lib/calendarEmitter.js';

// Recordatorios de usuario ligados a cliente (RF-16). Estado pendiente/completado/cancelado.
// "Vencido" = PENDING con fechaPrevista < now → se puede filtrar con ?vencidos=1.
export const remindersRouter = Router();

const CREATE_FIELDS = ['customerId', 'titulo', 'descripcion', 'fechaPrevista'] as const;
const UPDATE_FIELDS = ['titulo', 'descripcion', 'fechaPrevista', 'estado'] as const;

remindersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const where: Record<string, unknown> = { businessId: req.businessId, eliminadoEn: null };
  if (typeof q.customerId === 'string') where.customerId = q.customerId;
  if (q.estado === 'PENDING' || q.estado === 'DONE' || q.estado === 'CANCELLED') where.estado = q.estado;
  if (String(q.vencidos ?? '') === '1') {
    where.estado = 'PENDING';
    where.fechaPrevista = { lt: new Date() };
  }
  const rows = await prisma.reminder.findMany({
    where,
    orderBy: [{ fechaPrevista: 'asc' }, { createdAt: 'desc' }],
    include: { customer: { select: { nombre: true, apellido: true } } },
  });
  res.json({ items: rows.map(({ customer, ...r }) => ({ ...r, customerNombre: joinNombre(customer) })) });
});

// Contadores para el panel de seguimiento y la campana (RF-16 + colores-seguimiento).
// Agregado ligero (solo counts, sin listas) escopado por negocio Y por el usuario del token
// (responsableId): cada comercial ve SOLO sus propios compromisos, no los de todo el negocio.
remindersRouter.get('/summary', async (req: AuthedRequest, res: Response) => {
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const in7d = new Date(startToday);
  in7d.setDate(in7d.getDate() + 7);

  const base = { businessId: req.businessId, responsableId: req.userId, estado: 'PENDING' as const, eliminadoEn: null };
  const [vencidos, hoy, proximos7d] = await Promise.all([
    prisma.reminder.count({ where: { ...base, fechaPrevista: { lt: startToday } } }),
    prisma.reminder.count({ where: { ...base, fechaPrevista: { gte: startToday, lt: endToday } } }),
    prisma.reminder.count({ where: { ...base, fechaPrevista: { gte: endToday, lt: in7d } } }),
  ]);
  res.json({ vencidos, hoy, proximos7d });
});

remindersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customerId = String(body.customerId ?? '');
  const titulo = String(body.titulo ?? '').trim();
  if (!customerId || !titulo) return res.status(422).json({ error: { code: 'invalid', message: 'Falta customerId o titulo' } });
  const owner = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId, eliminadoEn: null } });
  if (!owner) return res.status(404).json({ error: { code: 'not_found', message: 'Cliente no encontrado' } });
  const data = pickFields(body, CREATE_FIELDS);
  if (data.fechaPrevista) data.fechaPrevista = new Date(String(data.fechaPrevista));
  const row = await prisma.reminder.create({
    data: { ...data, businessId: req.businessId!, customerId, responsableId: req.userId ?? null } as never,
  });

  // crm-citas-google-calendar (WU3.1): push opt-in a Google Calendar del
  // responsable si tiene el toggle activo, solo cuando hay fecha. Fire-and-forget.
  if (row.fechaPrevista && req.userId) {
    const businessId = req.businessId!;
    const responsableId = req.userId;
    void (async () => {
      try {
        const responsable = await prisma.user.findUnique({ where: { id: responsableId }, select: { calendarPushEnabled: true } });
        await maybePushCalendarEvent(responsable?.calendarPushEnabled ?? false, {
          uid: `reminder-${row.id}@crm`,
          businessId,
          titulo: `${row.titulo} — ${joinNombre(owner)}`.trim(),
          inicio: row.fechaPrevista as Date,
          fin: new Date((row.fechaPrevista as Date).getTime() + 30 * 60 * 1000),
          direccion: owner.direccion ?? undefined,
        });
      } catch (err) {
        console.error('[reminder.created] error en push calendario:', (err as Error).message);
      }
    })();
  }

  res.status(201).json(row);
});

remindersRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.reminder.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const data = pickFields(req.body ?? {}, UPDATE_FIELDS);
  if (data.fechaPrevista) data.fechaPrevista = new Date(String(data.fechaPrevista));
  const row = await prisma.reminder.update({ where: { id: req.params.id }, data: data as never });
  res.json(row);
});

remindersRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.reminder.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  await prisma.reminder.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});
