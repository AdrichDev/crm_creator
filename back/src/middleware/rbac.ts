import type { Response, NextFunction } from 'express';
import type { MemberRole } from '@prisma/client';
import type { AuthedRequest } from './types.js';

// Exige uno de los roles indicados sobre el tenant activo.
export function requireRole(...roles: MemberRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      return res.status(403).json({ error: { code: 'forbidden', message: 'Permisos insuficientes' } });
    }
    next();
  };
}
