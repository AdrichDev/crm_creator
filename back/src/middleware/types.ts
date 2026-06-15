import type { Request } from 'express';
import type { MemberRole } from '@prisma/client';

export interface AuthedRequest extends Request {
  userId?: string;
  businessId?: string;
  role?: MemberRole;
}
