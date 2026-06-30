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
