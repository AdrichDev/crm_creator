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

// Hash bcrypt dummy precomputado al cargar el módulo. Se usa en login cuando el
// usuario NO existe, para pagar el mismo coste de `bcrypt.compare` que cuando sí
// existe → evita el oráculo de enumeración por temporización (blueteam MEDIA).
// Es un hash válido de una password aleatoria; ninguna entrada real lo satisface.
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 10);
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d' });
}
export function verifyToken(token: string): VerifiedToken {
  return jwt.verify(token, env.jwtSecret) as VerifiedToken;
}
