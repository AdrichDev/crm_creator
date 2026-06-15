import { Router, type Request, type Response } from 'express';
import { env } from '../env.js';

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

/** Llama a la API de Anthropic y devuelve el JSON de tokens. */
async function extractWithAnthropic(source: string): Promise<DesignTokens> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicApiKey,
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

/**
 * POST /api/branding/extract
 * Body: { files: [{ name, content }] }  ó  { text }
 * Respuesta: { source: 'ai' | 'none', tokens: DesignTokens | null, message? }
 * Público (se usa al configurar un proyecto, antes de tener tenant).
 */
brandingRouter.post('/extract', async (req: Request, res: Response) => {
  const source = gatherSource(req.body ?? {});
  if (!source) {
    return res.status(422).json({ error: { code: 'validation', message: 'Envía files (css/html) o text.' } });
  }
  if (!env.anthropicApiKey) {
    // Sin key: el front cae a su heurística local. No es un error duro.
    return res.json({ source: 'none', tokens: null, message: 'IA no configurada (falta ANTHROPIC_API_KEY).' });
  }
  try {
    const tokens = await extractWithAnthropic(source);
    res.json({ source: 'ai', tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    res.status(502).json({ error: { code: 'ai_failed', message } });
  }
});
