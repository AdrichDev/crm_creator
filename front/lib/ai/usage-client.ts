'use client';
// Cliente de generación IA del CRM. Llama al proxy /api/ai/generate, que reenvía
// a agents-agency, donde el modelo se ejecuta y los tokens se descuentan del MISMO
// cliente (deductTokens + tokenUsage) → cómputo de tokens global compartido.

export type AiKind = 'marketing-plan' | 'market-study';

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
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
