import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/rbac.js';
import type { AuthedRequest } from '../middleware/types.js';
import { joinNombre } from '../lib/nombre.js';
import { emit } from '../lib/automation/index.js';
import { adminEmails } from '../lib/adminEmails.js';
import { buildTimeoffRequested, buildTimeoffResolved } from '../lib/eventPayloads.js';
import { timeoffRequestedEmail, timeoffResolvedEmail } from '../lib/email-templates.js';

export const timeOffRouter = Router();

// Enums → etiquetas castellanas que muestra el front (vacaciones).
const TIPO_LABEL: Record<string, string> = { VACATION: 'Vacaciones', SICK: 'Baja', LEAVE: 'Asuntos propios', OTHER: 'Otro' };
const ESTADO_LABEL: Record<string, string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' };

// GET / → solicitudes en el shape castellano del front (empleado/tipo/inicio/fin/dias/estado).
timeOffRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.timeOffRequest.findMany({ where: { businessId: req.businessId, eliminadoEn: null }, include: { employee: true }, orderBy: { inicio: 'desc' } });
  res.json(rows.map((r) => ({
    id: r.id,
    empleado: joinNombre(r.employee),
    tipo: TIPO_LABEL[r.tipo] ?? 'Otro',
    inicio: r.inicio.toISOString().slice(0, 10),
    fin: r.fin.toISOString().slice(0, 10),
    dias: r.dias ?? 0,
    estado: ESTADO_LABEL[r.estado] ?? 'Pendiente',
    employeeId: r.employeeId,
  })));
});

timeOffRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const { employeeId, tipo = 'VACATION', inicio, fin, dias, motivo } = req.body ?? {};
  if (!employeeId || !inicio || !fin) return res.status(422).json({ error: { code: 'validation', message: 'employeeId, inicio y fin requeridos' } });
  const row = await prisma.timeOffRequest.create({ data: { businessId: req.businessId!, employeeId, tipo, inicio: new Date(inicio), fin: new Date(fin), dias, motivo, estado: 'PENDING' } });
  res.status(201).json(row);

  // Fire-and-forget: aviso a los admins (emit directo, soft-fail). Nunca bloquea el 201.
  void (async () => {
    try {
      const [employee, business, admins] = await Promise.all([
        prisma.employee.findFirst({ where: { id: employeeId }, select: { nombre: true, apellido: true } }),
        prisma.business.findFirst({ where: { id: req.businessId }, select: { nombre: true } }),
        adminEmails(req.businessId!),
      ]);
      for (const email of admins) {
        const requestedPayload = buildTimeoffRequested({
          businessName: business?.nombre ?? '',
          email,
          employee,
          tipoLabel: TIPO_LABEL[tipo] ?? 'Otro',
          inicio: row.inicio,
          fin: row.fin,
          dias: row.dias,
        });
        await emit('timeoff.requested', requestedPayload, {
          businessId: req.businessId!,
          eventId: `${row.id}:requested:${email}`,
          email: timeoffRequestedEmail(requestedPayload),
        });
      }
    } catch (err) {
      console.error('[timeoff.requested] error en aviso a admins:', (err as Error).message);
    }
  })();
});

async function decide(req: AuthedRequest, res: Response, estado: 'APPROVED' | 'REJECTED') {
  const existing = await prisma.timeOffRequest.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const row = await prisma.timeOffRequest.update({ where: { id: existing.id }, data: { estado, decididoPor: req.userId, decididoEn: new Date() } });
  res.json(row);

  // Fire-and-forget: notificar al empleado la resolución SI tiene email (emit directo,
  // soft-fail). Employee.email existe en el modelo; si está vacío → skip suave.
  void (async () => {
    try {
      const [employee, business] = await Promise.all([
        prisma.employee.findFirst({ where: { id: row.employeeId }, select: { nombre: true, apellido: true, email: true } }),
        prisma.business.findFirst({ where: { id: req.businessId }, select: { nombre: true } }),
      ]);
      if (!employee?.email) return;
      const resolvedPayload = buildTimeoffResolved({
        businessName: business?.nombre ?? '',
        employee,
        email: employee.email,
        estadoLabel: ESTADO_LABEL[estado] ?? estado,
        inicio: row.inicio,
        fin: row.fin,
      });
      await emit('timeoff.resolved', resolvedPayload, {
        businessId: req.businessId!,
        eventId: `${row.id}:resolved:${estado}`,
        email: timeoffResolvedEmail(resolvedPayload),
      });
    } catch (err) {
      console.error('[timeoff.resolved] error en aviso al empleado:', (err as Error).message);
    }
  })();
}
timeOffRouter.patch('/:id/approve', requireRole('ADMIN', 'MANAGER'), (req: AuthedRequest, res) => decide(req, res, 'APPROVED'));
timeOffRouter.patch('/:id/reject', requireRole('ADMIN', 'MANAGER'), (req: AuthedRequest, res) => decide(req, res, 'REJECTED'));
