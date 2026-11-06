import type { Request, Response, NextFunction } from 'express';
import { handleCrossTenant } from '../lib/tenant.js';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Recurso no encontrado' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Red de seguridad: FK cross-tenant que llegara sin try/catch local → 422.
  if (handleCrossTenant(err, res)) return;
  // El detalle (Prisma, hosts, SQL) solo va al log del servidor, nunca al cliente.
  console.error('[error] no controlado:', err instanceof Error ? err.message : err);
  res.status(500).json({ error: { code: 'internal', message: 'Error interno' } });
}
