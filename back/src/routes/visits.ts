import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Registro de visitas (RF-12). POST crea la visita y, en la MISMA transacción, actualiza
// Customer.ultimaVisitaEn = fecha y, si viene estadoPosteriorId, el estadoVisitaId del cliente.
export const visitsRouter = Router();

visitsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const customerId = String((req.query as Record<string, unknown>).customerId ?? '');
  if (!customerId) return res.status(422).json({ error: { code: 'invalid', message: 'Falta customerId' } });
  const owner = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId, eliminadoEn: null } });
  if (!owner) return res.status(404).json({ error: { code: 'not_found', message: 'Cliente no encontrado' } });
  const rows = await prisma.visit.findMany({
    where: { businessId: req.businessId, customerId, eliminadoEn: null },
    orderBy: { fecha: 'desc' },
  });
  res.json({ items: rows });
});

visitsRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customerId = String(body.customerId ?? '');
  if (!customerId) return res.status(422).json({ error: { code: 'invalid', message: 'Falta customerId' } });
  const owner = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId, eliminadoEn: null } });
  if (!owner) return res.status(404).json({ error: { code: 'not_found', message: 'Cliente no encontrado' } });

  const fecha = body.fecha ? new Date(String(body.fecha)) : new Date();
  const estadoPosteriorId = typeof body.estadoPosteriorId === 'string' ? body.estadoPosteriorId : null;

  // Valida que el estado posterior pertenezca al negocio (evita cross-tenant).
  if (estadoPosteriorId) {
    const st = await prisma.visitState.findFirst({ where: { id: estadoPosteriorId, businessId: req.businessId, eliminadoEn: null } });
    if (!st) return res.status(422).json({ error: { code: 'invalid', message: 'Estado posterior inválido' } });
  }

  const [visit] = await prisma.$transaction([
    prisma.visit.create({
      data: {
        businessId: req.businessId!,
        customerId,
        employeeId: typeof body.employeeId === 'string' ? body.employeeId : null,
        fecha,
        resultado: typeof body.resultado === 'string' ? body.resultado : null,
        nota: typeof body.nota === 'string' ? body.nota : null,
        proximaAccion: typeof body.proximaAccion === 'string' ? body.proximaAccion : null,
        estadoPosteriorId,
      },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: {
        ultimaVisitaEn: fecha,
        ...(estadoPosteriorId ? { estadoVisitaId: estadoPosteriorId } : {}),
      },
    }),
  ]);
  res.status(201).json(visit);
});
