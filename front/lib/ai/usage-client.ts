'use client';
// Cliente de generación IA del CRM. Llama al proxy /api/ai/generate, que reenvía a
// agents-agency con el service token. El proxy exige sesión Supabase del operador.
import { getAccessToken } from '@/lib/auth/session';

export type AiKind = 'marketing-plan' | 'market-study' | 'branding-suggest';

export interface AiUsage { tokens: number; model: string }
export interface AiResult { content: string; usage?: AiUsage }

export class AiBlockedError extends Error {
  constructor(msg = 'Límite de uso de IA excedido para este cliente.') {
    super(msg);
    this.name = 'AiBlockedError';
  }
}

export interface GenerateInput {
  kind: AiKind;
  clientId?: string | null;
  model: string;
  effort?: string;
  prompt?: string;
}

export async function generateWithAI(input: GenerateInput): Promise<AiResult> {
  // El proxy exige sesión Supabase del operador (no es relay abierto).
  const tok = await getAccessToken();
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: JSON.stringify(input),
  });
  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    throw new AiBlockedError(body?.error || undefined);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Error de IA (${res.status})`);
  }
  return (await res.json()) as AiResult;
}

// --- UC-3 · Sugerir branding con IA (desacoplado de la landing) -------------
// A partir del CONTEXTO DEL NEGOCIO (nombre, vertical, descripción) la IA propone
// paleta/tipografía. NO analiza ninguna landing/HTML del cliente: ese flujo (ZIP)
// es aparte. El metering de tokens sigue centralizado en agents-agency (mismo proxy).

import type { DesignTokens } from '@/lib/config/tenant-config';

export interface BrandingSuggestInput {
  clientId?: string | null;
  model: string;
  effort?: string;
  business: { name: string; vertical: string; description?: string };
}

/** Propuesta de branding de la IA (forma estable, validada antes de aplicar). */
export interface BrandingSuggestion {
  tokens: DesignTokens;
  /** Comentario corto opcional de la IA sobre la propuesta. */
  rationale?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function isHex(v: unknown): v is string { return typeof v === 'string' && HEX.test(v); }

/**
 * Valida y NORMALIZA la respuesta cruda de la IA a `BrandingSuggestion`.
 * Solo deja pasar campos con forma esperada (paleta hex, tipografía string).
 * Devuelve `null` si no hay nada aplicable → el caller no aplica branding inválido.
 * Exportada para poder testearla sin red.
 */
export function parseBrandingSuggestion(content: string): BrandingSuggestion | null {
  let raw: unknown;
  try {
    // La IA puede envolver el JSON en texto/```; quédate con el primer objeto.
    const match = content.match(/\{[\s\S]*\}/);
    raw = JSON.parse(match ? match[0] : content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const palIn = (obj.palette ?? obj.colors) as Record<string, unknown> | undefined;
  const typoIn = (obj.typography ?? obj.fonts) as Record<string, unknown> | undefined;

  const palette: NonNullable<DesignTokens['palette']> = {};
  if (palIn) {
    for (const k of ['primary', 'secondary', 'background', 'text', 'accent'] as const) {
      if (isHex(palIn[k])) palette[k] = palIn[k] as string;
    }
  }
  const typography: NonNullable<DesignTokens['typography']> = {};
  if (typoIn) {
    if (typeof typoIn.heading === 'string') typography.heading = typoIn.heading;
    if (typeof typoIn.body === 'string') typography.body = typoIn.body;
  }

  const tokens: DesignTokens = {};
  if (Object.keys(palette).length) tokens.palette = palette;
  if (Object.keys(typography).length) tokens.typography = typography;
  if (!tokens.palette && !tokens.typography) return null;

  const rationale = typeof obj.rationale === 'string' ? obj.rationale : undefined;
  return { tokens, rationale };
}

function brandingPrompt(b: BrandingSuggestInput['business']): string {
  const desc = b.description?.trim() ? `\nDescripción: ${b.description.trim()}` : '';
  return [
    'Eres un director de arte. Propón una identidad visual para un CRM de este negocio.',
    `Negocio: ${b.name || '(sin nombre)'}\nSector: ${b.vertical}${desc}`,
    'Responde SOLO con un JSON con esta forma exacta (colores en hex #RRGGBB):',
    '{"palette":{"primary":"#...","secondary":"#...","background":"#...","text":"#...","accent":"#..."},' +
      '"typography":{"heading":"Nombre fuente","body":"Nombre fuente"},"rationale":"una frase"}',
  ].join('\n');
}

/**
 * Pide a la IA una propuesta de branding a partir del contexto del negocio.
 * Reusa `generateWithAI` (mismo proxy + metering). Propaga `AiBlockedError` (402).
 * Lanza si la respuesta no es una propuesta válida.
 */
export async function suggestBranding(input: BrandingSuggestInput): Promise<BrandingSuggestion & { usage?: AiUsage }> {
  const result = await generateWithAI({
    kind: 'branding-suggest',
    clientId: input.clientId,
    model: input.model,
    effort: input.effort ?? 'low',
    prompt: brandingPrompt(input.business),
  });
  const suggestion = parseBrandingSuggestion(result.content);
  if (!suggestion) throw new Error('La IA no devolvió una propuesta de branding válida.');
  return { ...suggestion, usage: result.usage };
}
