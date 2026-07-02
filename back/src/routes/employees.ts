import { Router, type Response } from 'express';
import { Prisma } from '../lib/generated/prisma/client.js';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { splitNombre, joinNombre, pickFields } from '../lib/nombre.js';
import { parsePagination } from '../lib/pagination.js';

// Empleados (crm.empleado) en castellano. La página usa nombre COMBINADO
// (nombre+apellido); aquí se combina al leer y se parte al escribir.
export const employeesRouter = Router();

const INPUT = ['rol', 'especialidad', 'email', 'estado', 'color', 'telefono'] as const;
function buildData(body: Record<string, unknown>): Record<string, unknown> {
  const data = pickFields(body, INPUT);
  if (typeof body.nombre === 'string') {
    const { nombre, apellido } = splitNombre(body.nombre);
    data.nombre = nombre;
    data.apellido = apellido;
  }
  return data;
}

// GET / → devuelve { items, total, page, limit } paginado con búsqueda ILIKE.
employeesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { page, limit, search } = parsePagination(req.query as Record<string, unknown>);

  const searchWhere = search ? {
    OR: [
      { nombre:   { contains: search, mode: 'insensitive' as const } },
      { apellido: { contains: search, mode: 'insensitive' as const } },
      { email:    { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};

  const where = { businessId: req.businessId, ...searchWhere };

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  res.json({
    items: rows.map((e) => ({
      id: e.id,
      nombre: joinNombre(e),
      rol: e.rol ?? '',
      especialidad: e.especialidad ?? '',
      email: e.email ?? '',
      telefono: e.telefono ?? '',
      estado: e.estado,
      color: e.color,
    })),
    total,
    page,
    limit,
  });
});

employeesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const data = buildData(req.body ?? {});
  if (!data.nombre) return res.status(422).json({ error: { code: 'invalid', message: 'Falta nombre' } });
  const row = await prisma.employee.create({ data: { ...data, businessId: req.businessId } as unknown as Prisma.EmployeeUncheckedCreateInput });
  res.status(201).json(row);
});

employeesRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const row = await prisma.employee.update({ where: { id: req.params.id }, data: buildData(req.body ?? {}) as Prisma.EmployeeUncheckedUpdateInput });
  res.json(row);
});

employeesRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  await prisma.employee.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});

// ----------------------------- Horario semanal (EmployeeSchedule) -----------------------------
// Tramos de disponibilidad del empleado por día de la semana. El PUT reemplaza
// el horario completo de forma atómica (deleteMany + createMany en una tx).
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Confirma que el empleado pertenece al negocio activo (scoping tenant). 404 si no.
async function findScopedEmployee(req: AuthedRequest) {
  return prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
}

employeesRouter.get('/:id/horario', async (req: AuthedRequest, res: Response) => {
  const employee = await findScopedEmployee(req);
  if (!employee) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const tramos = await prisma.employeeSchedule.findMany({
    where: { employeeId: employee.id },
    orderBy: [{ diaSemana: 'asc' }, { inicio: 'asc' }],
  });
  res.json({ tramos });
});

employeesRouter.put('/:id/horario', async (req: AuthedRequest, res: Response) => {
  const employee = await findScopedEmployee(req);
  if (!employee) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });

  const tramos = (req.body?.tramos ?? []) as Array<{ diaSemana: unknown; inicio: unknown; fin: unknown }>;
  if (!Array.isArray(tramos)) return res.status(400).json({ error: { code: 'validation', message: 'tramos debe ser un array' } });
  for (const t of tramos) {
    if (!Number.isInteger(t.diaSemana) || (t.diaSemana as number) < 0 || (t.diaSemana as number) > 6) {
      return res.status(400).json({ error: { code: 'validation', message: 'diaSemana debe ser un entero 0-6' } });
    }
    if (typeof t.inicio !== 'string' || !HHMM.test(t.inicio) || typeof t.fin !== 'string' || !HHMM.test(t.fin)) {
      return res.status(400).json({ error: { code: 'validation', message: 'inicio y fin deben tener formato HH:MM' } });
    }
  }

  // Reemplazo atómico: borra el horario previo y crea los nuevos tramos en la misma tx.
  await prisma.$transaction(async (tx) => {
    await tx.employeeSchedule.deleteMany({ where: { employeeId: employee.id } });
    if (tramos.length) {
      await tx.employeeSchedule.createMany({
        data: tramos.map((t) => ({ employeeId: employee.id, diaSemana: t.diaSemana as number, inicio: t.inicio as string, fin: t.fin as string })),
      });
    }
  });

  const nuevos = await prisma.employeeSchedule.findMany({
    where: { employeeId: employee.id },
    orderBy: [{ diaSemana: 'asc' }, { inicio: 'asc' }],
  });
  res.json({ tramos: nuevos });
});
