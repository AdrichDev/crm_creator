import type { Response, NextFunction } from 'express';
import type { MemberRole } from '../lib/generated/prisma/client.js';
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
export const STAFF_ROLES: MemberRole[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];

// Guard: deniega a CLIENT (y a cualquier rol no-staff) los endpoints de gestión.
export const staffOnly = requireRole(...STAFF_ROLES);

// Guard de CATÁLOGO: lectura (GET) permitida a cualquier miembro autenticado (incl. CLIENT,
// para poder ver servicios/productos y reservar); escritura (POST/PATCH/DELETE) solo staff.
// El catálogo no contiene PII; el riesgo de exponerlo en lectura al cliente es nulo.
export function staffOrClient(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    if (!req.role) return res.status(403).json({ error: { code: 'forbidden', message: 'Permisos insuficientes' } });
    return next();
  }
  if (req.role && STAFF_ROLES.includes(req.role)) return next();
  return res.status(403).json({ error: { code: 'forbidden', message: 'Permisos insuficientes' } });
}
