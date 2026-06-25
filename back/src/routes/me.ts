import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { joinNombre } from '../lib/nombre.js';

// Endpoints client-scoped: el usuario logueado (típicamente CLIENT) solo ve SUS
// propios datos. Se monta ANTES del guard staffOnly, así que es accesible a CLIENT.
// FUENTE ÚNICA REST: el portal del cliente (front app/me/*) consume estos endpoints;
// no accede a Supabase directo. La pertenencia se resuelve por userId (no por RLS).
export const meRouter = Router();

// Estado de reserva (enum) → etiqueta castellana que muestra el front.
const ESTADO_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada',
  COMPLETED: 'Completada', NO_SHOW: 'Cancelada',
};

// Resuelve el Customer del usuario dentro del tenant activo.
async function myCustomerId(req: AuthedRequest): Promise<string | null> {
  // Robusto: por Customer.userId (FK directa a auth.users, fijada en el auto-registro).
  // Inmune a emails duplicados/cambiados/nulos.
  const byUser = await prisma.customer.findFirst({
    where: { businessId: req.businessId, userId: req.userId, eliminadoEn: null },
    select: { id: true },
  });
  if (byUser) return byUser.id;
  // Fallback SOLO migratorio: clientes antiguos creados sin userId.
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
  if (!user?.email) return null;
  const customer = await prisma.customer.findFirst({
    where: { businessId: req.businessId, email: user.email, eliminadoEn: null },
    select: { id: true },
  });
  return customer?.id ?? null;
}

// GET /me/profile → ficha del cliente logueado (no datos de staff). Devuelve null
// si el usuario no tiene Customer en este negocio.
meRouter.get('/profile', async (req: AuthedRequest, res: Response) => {
  const c = await prisma.customer.findFirst({
    where: { businessId: req.businessId, userId: req.userId, eliminadoEn: null },
    select: { id: true, nombre: true, apellido: true, email: true, telefono: true },
  });
  if (!c) return res.json(null);
  res.json({
    id: c.id,
    nombre: joinNombre(c),
    email: c.email ?? '',
    telefono: c.telefono ?? '',
  });
});

// GET /me/bookings → citas del cliente en el shape castellano del front.
meRouter.get('/bookings', async (req: AuthedRequest, res: Response) => {
  const cid = await myCustomerId(req);
  if (!cid) return res.json([]);
  const rows = await prisma.booking.findMany({
    where: { businessId: req.businessId, customerId: cid },
    orderBy: { startAt: 'desc' },
    include: { service: true, employee: true },
  });
  res.json(rows.map((b) => ({
    id: b.id,
    servicio: b.service?.nombre ?? '',
    empleado: joinNombre(b.employee),
    fecha: b.startAt.toISOString().slice(0, 10),
    hora: b.startAt.toISOString().slice(11, 16),
    estado: ESTADO_LABEL[b.status] ?? 'Pendiente',
  })));
});

// GET /me/packages → bonos del cliente en shape castellano.
meRouter.get('/packages', async (req: AuthedRequest, res: Response) => {
  const cid = await myCustomerId(req);
  if (!cid) return res.json([]);
  const rows = await prisma.customerPackage.findMany({
    where: { businessId: req.businessId, customerId: cid },
    orderBy: { compradoEn: 'desc' },
    include: { package: true },
  });
  res.json(rows.map((p) => ({
    id: p.id,
    paquete: p.package?.nombre ?? '',
    sesionesTotal: p.sesionesTotal,
    sesionesUsadas: p.sesionesUsadas,
    restantes: p.sesionesTotal - p.sesionesUsadas,
    estado: p.estado,
    expiraEn: p.expiraEn ? p.expiraEn.toISOString() : null,
  })));
});
