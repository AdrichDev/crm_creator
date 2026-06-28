import type { Request } from 'express';
import type { MemberRole } from '../lib/generated/prisma/client.js';

export interface AuthedRequest extends Request {
  userId?: string;
  businessId?: string;
  role?: MemberRole;
}
