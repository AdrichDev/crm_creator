import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../env.js';
import { getTenantSecret } from '../lib/tenant-secrets/store.js';
import { verifySupabaseToken, type SupabaseTokenPayload } from '../lib/auth.js';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

/**
 * Design-tokens que la IA extrae de la landing. La landing manda: OperaOS solo
 * lee su estilo y lo aplica al CRM generado.
 */
export interface DesignTokens {
  palette: { primary?: string; secondary?: string; background?: string; text?: string; accent?: string };
  typography: { heading?: string; body?: string };
  shape: { radius?: string; shadow?: string };
  logo: { found: boolean; note?: string };
}

const SYSTEM = `Eres un extractor de design-tokens. Recibes el HTML/CSS de una landing page.
Devuelves EXCLUSIVAMENTE un objeto JSON (sin markdown, sin texto extra) con esta forma:
{
  "palette": { "primary": "#rrggbb", "secondary": "#rrggbb", "background": "#rrggbb", "text": "#rrggbb", "accent": "#rrggbb" },
  "typography": { "heading": "Nombre de fuente, fallback", "body": "Nombre de fuente, fallback" },
  "shape": { "radius": "12px", "shadow": "0 1px 3px rgba(0,0,0,.1)" },
  "logo": { "found": true, "note": "descripción breve si detectas un logo/imagen de marca" }
}
Reglas:
- Colores SIEMPRE en hex #rrggbb. "primary" es el color de marca dominante (botones/acentos), no el fondo.
- Si un valor no se puede determinar, omite esa clave (no inventes).
- No incluyas comentarios ni claves fuera del esquema.`;

interface ExtractBody {
  files?: { name: string; content: string }[];
  /** Texto plano ya concatenado (alternativa a files). */
  text?: string;
  /**
   * crm-env-contract-tiers (WU2.2, adopción de referencia): negocio para
   * resolver su propia clave Anthropic vía `getTenantSecret` antes de caer a
   * la del operador. OPCIONAL — este endpoint también se usa durante el
   * onboarding, ANTES de que exista un negocio (ver montaje público en
   * routes/index.ts); sin `businessId` el comportamiento es idéntico al
   * anterior a este change (clave del operador, sin regresión).
   */
  businessId?: string;
}

/** Une el contenido relevante (css/html) y lo recorta para no pasarnos de contexto. */
function gatherSource(body: ExtractBody): string {
  if (body.text && body.text.trim()) return body.text.slice(0, 60_000);
  const files = body.files ?? [];
  const relevant = files
    .filter((f) => /\.(css|html?)$/i.test(f.name) && typeof f.content === 'string')
    .map((f) => `/* ===== ${f.name} ===== */\n${f.content}`)
    .join('\n\n');
  return relevant.slice(0, 60_000);
}

/** Llama a la API de Anthropic (con una clave YA resuelta) y devuelve el JSON de tokens. */
async function extractWithAnthropic(source: string, apiKey: string): Promise<DesignTokens> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: `HTML/CSS de la landing:\n\n${source}` }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = (data.content ?? []).map((c) => c.text ?? '').join('').trim();
  // El modelo puede envolver en ```json … ```; nos quedamos con el primer objeto {...}.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Respuesta de IA sin JSON');
  return JSON.parse(match[0]) as DesignTokens;
}

/** Dependencias inyectables (patrón DI del repo, ver routes/tenant-config.ts). */
export interface BrandingExtractDeps {
  getTenantSecret: typeof getTenantSecret;
  extractWithAnthropic: typeof extractWithAnthropic;
}

const defaultDeps: BrandingExtractDeps = { getTenantSecret, extractWithAnthropic };

/** Identidad para gastar una clave de IA (inyectable en tests). */
export interface BrandingAuthDeps {
  verify: (token: string) => Promise<SupabaseTokenPayload>;
  isMember: (userId: string, businessId: string) => Promise<boolean>;
}

const defaultAuthDeps: BrandingAuthDeps = {
  verify: verifySupabaseToken,
  isMember: async (userId, businessId) => !!(await prisma.membership.findFirst({ where: { userId, businessId }, select: { id: true } })),
};

const EXTRACT_PER_MINUTE = 10;

/**
 * La extracción gasta una clave de Anthropic, así que exige sesión:
 * - con negocio (header x-business-id o body.businessId): hay que ser miembro de él;
 *   se usa la clave del negocio (con fallback a la del operador, como antes).
 * - sin negocio (montar un proyecto nuevo): solo el operador de la plataforma
 *   (`app_metadata.role = 'operator'`) puede usar la clave del operador.
 */
export function brandingAuth(deps: BrandingAuthDeps = defaultAuthDeps) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'no_token', message: 'Falta token' } });
    }
    let claims: SupabaseTokenPayload;
    try {
      claims = await deps.verify(header.slice(7));
    } catch {
      return res.status(401).json({ error: { code: 'invalid_token', message: 'Token inválido' } });
    }
    const fromHeader = typeof req.headers['x-business-id'] === 'string' ? req.headers['x-business-id'].trim() : '';
    const fromBody = typeof req.body?.businessId === 'string' ? req.body.businessId.trim() : '';
    const businessId = fromHeader || fromBody;
    try {
      if (businessId) {
        if (!(await deps.isMember(claims.sub, businessId))) {
          return res.status(403).json({ error: { code: 'wrong_business', message: 'No tienes acceso a ese negocio' } });
        }
        req.businessId = businessId;
      } else if (claims.appRole !== 'operator') {
        return res.status(403).json({ error: { code: 'forbidden', message: 'Sin negocio activo, solo el operador puede usar la IA de branding' } });
      }
    } catch (e) {
      console.error('[branding] error resolviendo acceso:', (e as Error).message);
      return res.status(500).json({ error: { code: 'server_error', message: 'Error interno' } });
    }
    req.userId = claims.sub;
    next();
  };
}

/**
 * Resuelve la clave Anthropic a usar en esta petición:
 * - Con `businessId` → `getTenantSecret` (clave propia del negocio, con
 *   fallback a `ANTHROPIC_API_KEY` del operador). `source` distingue cuál se usó.
 * - Sin `businessId` (onboarding, sin tenant todavía) → directamente la clave
 *   del operador — comportamiento IDÉNTICO al anterior a este change.
 */
async function resolveAnthropicKey(
  deps: BrandingExtractDeps,
  businessId: string | undefined,
): Promise<{ value: string; source: 'tenant' | 'operator' } | null> {
  if (businessId) {
    return deps.getTenantSecret(businessId, 'ANTHROPIC_API_KEY', { fallbackEnv: 'ANTHROPIC_API_KEY' });
  }
  return env.anthropicApiKey ? { value: env.anthropicApiKey, source: 'operator' } : null;
}

/**
 * Handler de `POST /api/branding/extract`.
 * Body: { files: [{ name, content }] }  ó  { text }, + `businessId` opcional.
 * Respuesta: { source: 'ai' | 'none', tokens: DesignTokens | null, message? }
 * Público (se usa al configurar un proyecto, antes de tener tenant, y también
 * desde ajustes de un negocio ya existente si el caller aporta `businessId`).
 */
export async function extractHandler(deps: BrandingExtractDeps, req: Request, res: Response) {
  const body = (req.body ?? {}) as ExtractBody;
  const source = gatherSource(body);
  if (!source) {
    return res.status(422).json({ error: { code: 'validation', message: 'Envía files (css/html) o text.' } });
  }

  // Negocio ya validado por brandingAuth (membresía); nunca se toma del body sin validar.
  const businessId = (req as AuthedRequest).businessId || undefined;
  const resolved = await resolveAnthropicKey(deps, businessId);
  if (!resolved) {
    // Sin key: el front cae a su heurística local. No es un error duro.
    return res.json({ source: 'none', tokens: null, message: 'IA no configurada (falta ANTHROPIC_API_KEY).' });
  }

  try {
    const tokens = await deps.extractWithAnthropic(source, resolved.value);
    res.json({ source: 'ai', tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    res.status(502).json({ error: { code: 'ai_failed', message } });
  }
}

export function createBrandingRouter(auth: BrandingAuthDeps = defaultAuthDeps, deps: BrandingExtractDeps = defaultDeps): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    max: EXTRACT_PER_MINUTE,
    keyGenerator: (req) => (req as AuthedRequest).userId ?? 'anonymous',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'too_many_requests', message: 'Demasiadas extracciones, inténtalo en un minuto.' } },
  });
  router.post('/extract', brandingAuth(auth), limiter, (req: Request, res: Response) => extractHandler(deps, req, res));
  return router;
}

export const brandingRouter = createBrandingRouter();
