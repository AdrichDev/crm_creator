import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface JwtPayload { userId: string; }
// `iat` (issued-at, segundos epoch) lo añade jsonwebtoken al firmar y se usa para
// invalidar sesiones: un JWT con `iat` anterior a `User.passwordChangedAt` se rechaza.
export interface VerifiedToken extends JwtPayload { iat: number; }

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d' });
}
export function verifyToken(token: string): VerifiedToken {
  return jwt.verify(token, env.jwtSecret) as VerifiedToken;
}
