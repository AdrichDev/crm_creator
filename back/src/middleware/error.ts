import type { Request, Response, NextFunction } from 'express';
import { handleCrossTenant } from '../lib/tenant.js';
import { TenantScopeError } from '../lib/tenant-scope.js';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Recurso no encontrado' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Red de seguridad: FK cross-tenant que llegara sin try/catch local → 422.
  if (handleCrossTenant(err, res)) return;
  // Guarda de tenancy (S2): una consulta sin negocio es un fallo de PROGRAMACIÓN, no
  // una respuesta al usuario. Se registra con modelo+operación y se responde 500 genérico
  // sin detalles (ni modelo, ni operación, ni SQL) en el cuerpo.
  if (err instanceof TenantScopeError) {
    console.error(
      '[error] TenantScopeError (consulta sin negocio, fallo de programación):',
      `${err.model}.${err.operation}`,
      err.message,
    );
    res.status(500).json({ error: { code: 'internal', message: 'Error interno' } });
    return;
  }
  // El detalle (Prisma, hosts, SQL) solo va al log del servidor, nunca al cliente.
  console.error('[error] no controlado:', err instanceof Error ? err.message : err);
  res.status(500).json({ error: { code: 'internal', message: 'Error interno' } });
}
