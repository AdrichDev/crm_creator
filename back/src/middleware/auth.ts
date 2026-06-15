import type { Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import { verifyToken } from '../lib/auth.js';
import type { AuthedRequest } from './types.js';

// Verifica JWT, resuelve el tenant activo (cabecera x-business-id o el primero)
// y adjunta userId, businessId y role a la request.
export async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'no_token', message: 'Falta token' } });
    const { userId } = verifyToken(header.slice(7));
    const memberships = await prisma.membership.findMany({ where: { userId } });
    if (memberships.length === 0) return res.status(403).json({ error: { code: 'no_membership', message: 'Sin acceso a ninguna empresa' } });
    const wanted = req.headers['x-business-id'] as string | undefined;
    const membership = memberships.find((m: { businessId: string }) => m.businessId === wanted) ?? memberships[0];
    req.userId = userId;
    req.businessId = membership.businessId;
    req.role = membership.role;
    next();
  } catch {
    return res.status(401).json({ error: { code: 'invalid_token', message: 'Token inválido' } });
  }
}
