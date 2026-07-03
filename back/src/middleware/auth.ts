import type { Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import { verifySupabaseToken } from '../lib/auth.js';
import type { AuthedRequest } from './types.js';

// Verifies the Supabase access token (ES256 vía JWKS, Bearer), resolves the active tenant
// via x-business-id header (validated against the user's Memberships), and attaches
// userId / businessId / role to the request.
// Session revocation on password change is handled by Supabase (admin.signOut).
// The passwordChangedAt / iat check from the old custom JWT flow is removed.
export async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'no_token', message: 'Falta token' } });
  }

  // (a) Token verification failures are CLIENT errors → 401. Scoped to its own try
  // so a DB fault below is NOT misreported as an invalid token.
  let sub: string;
  try {
    ({ sub } = await verifySupabaseToken(header.slice(7)));
  } catch {
    return res.status(401).json({ error: { code: 'invalid_token', message: 'Token inválido' } });
  }

  // (b) Membership resolution. A DB failure here is a SERVER error → 500 (the token
  // was valid; we just couldn't serve the request).
  try {
    const memberships = await prisma.membership.findMany({ where: { userId: sub } });
    if (memberships.length === 0) {
      return res.status(403).json({ error: { code: 'no_membership', message: 'Sin acceso a ninguna empresa' } });
    }

    const wanted = req.headers['x-business-id'] as string | undefined;
    const membership = memberships.find((m) => m.businessId === wanted) ?? memberships[0];
    // GET /projects lista TODOS los negocios del usuario — no depende de un negocio
    // activo. Si x-business-id quedó obsoleto (localStorage stale, negocio borrado),
    // no debe bloquear el propio listado que serviría para elegir uno válido.
    const isProjectsList = req.method === 'GET' && req.path === '/projects';
    if (wanted && membership.businessId !== wanted && !isProjectsList) {
      return res.status(403).json({ error: { code: 'wrong_business', message: 'No tienes acceso a ese negocio' } });
    }

    req.userId = sub;
    req.businessId = membership.businessId;
    req.role = membership.role;
    next();
  } catch (e) {
    console.error('[auth] error resolviendo membership:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'Error interno' } });
  }
}
