import type { Request } from 'express';
import type { MemberRole } from '../lib/generated/prisma/client.js';

export interface AuthedRequest extends Request {
  userId?: string;
  businessId?: string;
  role?: MemberRole;
  // crm-tenant-api-keys: negocio resuelto por resolveTenantApiKey (carril de auth
  // paralelo, portador, sin sesión de usuario). Nunca lo fija `authenticate`.
  tenantBusinessId?: string;
}
