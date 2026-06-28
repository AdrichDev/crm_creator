import { timingSafeEqual } from 'node:crypto';
import type { Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { verifySupabaseToken } from '../lib/auth.js';
import type { AuthedRequest } from './types.js';

/** Constant-time compare; length-guarded so it never throws on mismatched sizes. */
function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

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

  // Service-token (ops-bot) bypass. Enabled only when CRM_SERVICE_TOKEN is set.
  // A matching Bearer enters as ADMIN over the business named in x-business-id;
  // NO Supabase/membership lookup. x-business-id is mandatory in this mode.
  if (env.serviceToken && tokensMatch(header.slice(7), env.serviceToken)) {
    const businessId = req.headers['x-business-id'] as string | undefined;
    if (!businessId) {
      return res.status(400).json({ error: { code: 'no_business', message: 'Falta x-business-id (modo servicio)' } });
    }
    req.userId = undefined;
    req.businessId = businessId;
    req.role = 'ADMIN';
    return next();
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
    if (wanted && membership.businessId !== wanted) {
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
