'use client';
// UC-3 · Sugerir branding con IA (reversible, desacoplado de la landing).
// A partir del contexto del negocio (nombre, vertical, descripción) la IA propone
// paleta/tipografía. Flujo: Sugerir → PREVISUALIZAR → Aplicar (guarda el anterior)
// → Deshacer (restaura). No analiza ninguna landing; el ZIP es un flujo aparte.

import { useState } from 'react';
import { suggestBranding, AiBlockedError, type BrandingSuggestion } from '@/lib/ai/usage-client';
import type { DesignTokens } from '@/lib/config/tenant-config';
import { Sparkles, Loader2, Check, Undo2 } from 'lucide-react';

export interface BrandingSnapshot {
  primary: string;
  secondary: string;
  tokens?: DesignTokens;
}

type Patch = Partial<{ primary: string; secondary: string; tokens: DesignTokens }>;

interface Props {
  business: { name: string; vertical: string; description?: string };
  clientId?: string | null;
  /** Branding actual, para poder restaurarlo al deshacer. */
  current: BrandingSnapshot;
  /** Aplica un patch de branding al draft/config. */
  onApply: (patch: Patch) => void;
  /** Modelo de IA a usar (por defecto un modelo barato/effort bajo). */
  model?: string;
}

export function AiBrandingSuggest({ business, clientId, current, onApply, model = 'gpt-5-mini' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BrandingSuggestion | null>(null);
  // Snapshot del branding ANTES de aplicar, para "Deshacer".
  const [previous, setPrevious] = useState<BrandingSnapshot | null>(null);

  async function onSuggest() {
    setBusy(true); setError(null); setPreview(null);
    try {
      const s = await suggestBranding({ business, clientId, model });
      setPreview(s);
    } catch (e) {
      setError(e instanceof AiBlockedError
        ? 'Sin cupo de IA para este cliente.'
        : e instanceof Error ? e.message : 'Error de IA.');
    } finally {
      setBusy(false);
    }
  }

  function applyPreview() {
    if (!preview) return;
    setPrevious(current);              // guarda el anterior antes de pisar
    const pal = preview.tokens.palette ?? {};
    onApply({
      primary: pal.primary ?? current.primary,
      secondary: pal.secondary ?? current.secondary,
      tokens: preview.tokens,
    });
    setPreview(null);
  }

  function undo() {
    if (!previous) return;
    onApply({ primary: previous.primary, secondary: previous.secondary, tokens: previous.tokens });
    setPrevious(null);
  }

  const pal = preview?.tokens.palette ?? {};
  const typo = preview?.tokens.typography;

  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
            <Sparkles className="h-4 w-4 text-[var(--gold)]" /> Sugerir branding con IA
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            A partir del nombre y sector del negocio. Previsualiza antes de aplicar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {previous && (
            <button type="button" onClick={undo}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Undo2 className="h-4 w-4" /> Deshacer
            </button>
          )}
          <button type="button" onClick={onSuggest} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Sugerir
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-amber-600">{error}</p>}

      {preview && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-700">Previsualización</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map((k) =>
              pal[k] ? (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600">
                  <span className="h-3.5 w-3.5 rounded-full border border-gray-300" style={{ background: pal[k] }} />
                  {k}: {pal[k]}
                </span>
              ) : null,
            )}
          </div>
          {typo && (typo.heading || typo.body) && (
            <p className="mt-2 text-[11px] text-gray-500">
              Tipografía: {[typo.heading, typo.body].filter(Boolean).join(' · ')}
            </p>
          )}
          {preview.rationale && <p className="mt-1 text-[11px] italic text-gray-500">{preview.rationale}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={applyPreview}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              <Check className="h-3.5 w-3.5" /> Aplicar
            </button>
            <button type="button" onClick={() => setPreview(null)}
              className="text-[11px] text-gray-500 hover:underline">Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}
