import crypto from 'node:crypto';

// Firma HMAC-SHA256 sobre `timestamp.body` (no solo body) para cerrar replay.
// n8n recomputa la firma con el mismo secreto y rechaza si no coincide.
export function sign(secret: string, timestamp: number, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

// Verificación en tiempo constante (defensa frente a timing). Reutilizable por el
// receptor / por los tests. Devuelve false ante cualquier desajuste de longitud.
export function verify(secret: string, timestamp: number, rawBody: string, signature: string): boolean {
  const expected = sign(secret, timestamp, rawBody);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
