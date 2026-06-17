'use client';
// Sugerir branding con IA (reversible). A partir del contexto del negocio + un
// texto libre de estilo, la IA propone paleta/tipografía. Si hay un diseño de
// landing cargado, se basa en su front/CSS; si no, en el estilo que describas.
// Flujo: Generar prompt → PREVISUALIZAR → Aplicar (guarda el anterior) → Deshacer.
//
// IMPORTANTE: estas acciones son trabajo del OPERADOR, no del cliente → se llaman
// con clientId=null para que NO descuenten del cómputo de tokens del cliente.

import { useState } from 'react';
import { suggestBranding, AiBlockedError, type BrandingSuggestion } from '@/lib/ai/usage-client';
import type { DesignTokens } from '@/lib/config/tenant-config';
import { ModelEffortSelect } from '@/components/config/model-effort-select';
import { Sparkles, Loader2, Check, Undo2 } from 'lucide-react';

export interface BrandingSnapshot {
  primary: string;
  secondary: string;
  tokens?: DesignTokens;
}

type Patch = Partial<{ primary: string; secondary: string; tokens: DesignTokens }>;

interface Props {
  business: { name: string; vertical: string };
  /** Branding actual, para poder restaurarlo al deshacer. */
  current: BrandingSnapshot;
  /** Aplica un patch de branding al draft/config. */
  onApply: (patch: Patch) => void;
  /** Nombre del diseño de landing importado (si lo hay): la IA se basará en él. */
  landingSource?: string;
}

export function AiBrandingSuggest({ business, current, onApply, landingSource }: Props) {
  const [model, setModel] = useState('gpt-5.4-mini');
  const [effort, setEffort] = useState('low');
  const [style, setStyle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BrandingSuggestion | null>(null);
  const [previous, setPrevious] = useState<BrandingSnapshot | null>(null);

  const hasLanding = !!landingSource;

  async function onGenerate() {
    setBusy(true); setError(null); setPreview(null);
    try {
      // Contexto: si hay landing cargada, la IA se basa en su estilo; el texto
      // libre afina la dirección. Sin landing, el texto libre manda.
      const description = [
        hasLanding ? `Básate en el estilo del diseño de landing importado ("${landingSource}").` : '',
        style.trim(),
      ].filter(Boolean).join(' ');
      // clientId=null → trabajo del operador, NO cuenta para los tokens del cliente.
      const s = await suggestBranding({ business: { ...business, description }, clientId: null, model, effort });
      setPreview(s);
    } catch (e) {
      setError(e instanceof AiBlockedError
        ? 'Sin cupo de IA.'
        : e instanceof Error ? e.message : 'Error de IA.');
    } finally {
      setBusy(false);
    }
  }

  function applyPreview() {
    if (!preview) return;
    setPrevious(current);
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
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
          <Sparkles className="h-4 w-4 text-[#2563eb]" /> Sugerir branding con IA
        </p>
        {previous && (
          <button type="button" onClick={undo}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Undo2 className="h-3.5 w-3.5" /> Deshacer
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        {hasLanding
          ? `La IA se basará en el diseño de "${landingSource}". Añade indicaciones si quieres.`
          : 'No hay landing cargada: describe el estilo que quieres y genera el prompt.'}
      </p>

      {/* Selector de IA (mismos modelos que agents-agency) */}
      <div className="mt-3">
        <ModelEffortSelect model={model} effort={effort} onModelChange={setModel} onEffortChange={setEffort} />
      </div>

      {/* Texto libre del estilo deseado */}
      <div className="mt-3">
        <label className="text-xs font-medium text-gray-500">Estilo deseado</label>
        <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={3}
          placeholder="p. ej. minimalista, tonos tierra, tipografía serif elegante…"
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onGenerate} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#2563eb] px-3 py-2 text-sm font-medium text-[#2563eb] hover:bg-[#2563eb]/10 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar prompt
        </button>
        <span className="text-[11px] text-gray-400">Estos tokens no se cargan al cliente (trabajo del operador).</span>
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
            <p className="mt-2 text-[11px] text-gray-500">Tipografía: {[typo.heading, typo.body].filter(Boolean).join(' · ')}</p>
          )}
          {preview.rationale && <p className="mt-1 text-[11px] italic text-gray-500">{preview.rationale}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={applyPreview}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
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
