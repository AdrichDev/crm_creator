import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/rbac.js';
import type { AuthedRequest } from '../middleware/types.js';

export const timeOffRouter = Router();

// Enums → etiquetas castellanas que muestra el front (vacaciones).
const TIPO_LABEL: Record<string, string> = { VACATION: 'Vacaciones', SICK: 'Baja', LEAVE: 'Asuntos propios', OTHER: 'Otro' };
const ESTADO_LABEL: Record<string, string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' };
const nombreEmpleado = (e: { nombre: string; apellido?: string | null } | null | undefined) =>
  e ? [e.nombre, e.apellido].filter(Boolean).join(' ') : '';

// GET / → solicitudes en el shape castellano del front (empleado/tipo/inicio/fin/dias/estado).
timeOffRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.timeOffRequest.findMany({ where: { businessId: req.businessId, eliminadoEn: null }, include: { employee: true }, orderBy: { inicio: 'desc' } });
  res.json(rows.map((r) => ({
    id: r.id,
    empleado: nombreEmpleado(r.employee),
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
});

async function decide(req: AuthedRequest, res: Response, estado: 'APPROVED' | 'REJECTED') {
  const existing = await prisma.timeOffRequest.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const row = await prisma.timeOffRequest.update({ where: { id: existing.id }, data: { estado, decididoPor: req.userId, decididoEn: new Date() } });
  res.json(row);
}
timeOffRouter.patch('/:id/approve', requireRole('OWNER', 'ADMIN', 'MANAGER'), (req: AuthedRequest, res) => decide(req, res, 'APPROVED'));
timeOffRouter.patch('/:id/reject', requireRole('OWNER', 'ADMIN', 'MANAGER'), (req: AuthedRequest, res) => decide(req, res, 'REJECTED'));
