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

// Roles de "staff" (empleo): tienen acceso a los datos de gestión del negocio.
// El rol CLIENT queda FUERA → no puede tocar endpoints de staff (solo su /me/*).
export const STAFF_ROLES: MemberRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RECEPTIONIST', 'PROFESSIONAL', 'ACCOUNTANT'];

// Guard: deniega a CLIENT (y a cualquier rol no-staff) los endpoints de gestión.
export const staffOnly = requireRole(...STAFF_ROLES);
