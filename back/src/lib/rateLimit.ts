import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Rate limiter en memoria (sin dependencias). Ventana fija por clave.
// Pensado para un único proceso (el back actual). Si se escala a varias
// réplicas habría que mover el contador a Redis; documentado como deuda.
// ---------------------------------------------------------------------------

interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();

// Limpieza perezosa: cada cierto número de operaciones purga buckets vencidos
// para que el Map no crezca sin límite con IPs/emails distintos.
let opsSinceSweep = 0;
function sweep(now: number) {
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Construye la clave del bucket a partir de la request (ip + email, etc.). */
  keyOf: (req: Request) => string;
  /** Prefijo para aislar limiters distintos que compartan clave (p.ej. ip). */
  bucket: string;
}

/** True si la operación se permite; muta el contador. Reutilizable fuera de Express (tests). */
export function consume(bucket: string, key: string, windowMs: number, max: number, now = Date.now()): boolean {
  if (++opsSinceSweep >= 500) { opsSinceSweep = 0; sweep(now); }
  const k = `${bucket}:${key}`;
  const existing = buckets.get(k);
  if (!existing || existing.resetAt <= now) {
    buckets.set(k, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

/** Solo para tests: vacía todos los contadores. */
export function resetRateLimits() { buckets.clear(); opsSinceSweep = 0; }

/** Middleware Express. Responde 429 al exceder el límite. */
export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const allowed = consume(opts.bucket, opts.keyOf(req), opts.windowMs, opts.max);
    if (!allowed) {
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Demasiados intentos, espera unos minutos' } });
    }
    next();
  };
}

/** Clave por IP del cliente (respeta proxy si Express tiene trust proxy). */
export function ipKey(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Clave combinada ip:email para el limiter de login.
 * Evita que un atacante eluda el límite por IP rotando IPs hacia el mismo email.
 * Retrocede a solo-IP si el email no está en el body (no debe ocurrir en login
 * porque el schema lo valida antes, pero es defensivo).
 */
export function ipEmailKey(req: Request): string {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
  return email ? `${ip}:${email}` : ip;
}
