import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', async (req: AuthedRequest, res: Response) => {
  const businessId = req.businessId;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const [bookingsToday, noShows, customers, products, employees] = await Promise.all([
    prisma.booking.count({ where: { businessId, startAt: { gte: start, lte: end } } }),
    prisma.booking.count({ where: { businessId, status: 'NO_SHOW', startAt: { gte: start, lte: end } } }),
    prisma.customer.count({ where: { businessId } }),
    prisma.product.count({ where: { businessId } }),
    prisma.employee.count({ where: { businessId } }),
  ]);
  res.json({ bookingsToday, noShows, customers, products, employees });
});
