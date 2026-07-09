import { Router, type Request, type Response } from 'express';
import { env } from '../env.js';
import { getTenantSecret } from '../lib/tenant-secrets/store.js';

export const brandingRouter = Router();

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

  const businessId = typeof body.businessId === 'string' && body.businessId.trim() ? body.businessId.trim() : undefined;
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

brandingRouter.post('/extract', (req: Request, res: Response) => extractHandler(defaultDeps, req, res));
