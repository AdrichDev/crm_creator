'use client';
// Sugerir branding con IA (reversible). Dos vías:
//  1) "Generar prompt": a partir del contexto del negocio + tu texto de estilo.
//  2) "Generar desde landing": a partir de los ESTILOS REALES capturados del .zip
//     importado (paleta/tipografía que extrajo BrandingForm) — disponible solo si hay
//     landing cargada.
// Flujo común: generar → PREVISUALIZAR → Aplicar (guarda el anterior) → Deshacer.
//
// IMPORTANTE: estas acciones son trabajo del OPERADOR, no del cliente → se llaman
// con clientId=null para que NO descuenten del cómputo de tokens del cliente.

import { useState } from 'react';
import { suggestBranding, AiBlockedError, type BrandingSuggestion } from '@/lib/ai/usage-client';
import type { DesignTokens } from '@/lib/config/tenant-config';
import { ModelEffort } from '@/components/ai/model-effort';
import { Sparkles, Loader2, Check, Undo2, FileArchive } from 'lucide-react';

export interface BrandingSnapshot {
  primary: string;
  secondary: string;
  tokens?: DesignTokens;
}

type Patch = Partial<{ primary: string; secondary: string; tokens: DesignTokens }>;

interface Props {
  business: { name: string; vertical: string };
  /** Branding actual (incluye los tokens capturados del .zip), para deshacer y para
   *  "Generar desde landing". */
  current: BrandingSnapshot;
  /** Aplica un patch de branding al draft/config. */
  onApply: (patch: Patch) => void;
  /** Nombre del diseño de landing importado (si lo hay): habilita "Generar desde landing". */
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

  // Descripción a partir de los ESTILOS REALES capturados del .zip (no el nombre).
  function landingDescription(): string {
    const pal = current.tokens?.palette ?? {};
    const typo = current.tokens?.typography;
    const colors = [
      `principal ${pal.primary ?? current.primary}`,
      `secundario ${pal.secondary ?? current.secondary}`,
      pal.accent ? `acento ${pal.accent}` : '',
      pal.background ? `fondo ${pal.background}` : '',
      pal.text ? `texto ${pal.text}` : '',
    ].filter(Boolean).join(', ');
    return [
      `Genera un branding de CRM coherente con los estilos capturados de la landing del cliente ("${landingSource}").`,
      `Paleta capturada: ${colors}.`,
      typo && (typo.heading || typo.body) ? `Tipografía capturada: ${[typo.heading, typo.body].filter(Boolean).join(' / ')}.` : '',
      style.trim() ? `Indicaciones adicionales: ${style.trim()}.` : '',
      'Respeta esos colores y tipografía como base; completa de forma armónica los que falten.',
    ].filter(Boolean).join(' ');
  }

  async function generate(description: string) {
    setBusy(true); setError(null); setPreview(null);
    try {
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
          <Sparkles className="h-4 w-4 text-[var(--acc)]" /> Sugerir branding con IA
        </p>
        {previous && (
          <button type="button" onClick={undo}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Undo2 className="h-3.5 w-3.5" /> Deshacer
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        Genera el branding desde tu descripción, o directamente desde los estilos del
        .zip de la landing si lo has importado.
      </p>

      {/* Selector de IA (mismos modelos que agents-agency) */}
      <div className="mt-3">
        <ModelEffort variant="config" model={model} effort={effort} onModel={setModel} onEffort={setEffort} />
      </div>

      {/* Texto libre del estilo deseado */}
      <div className="mt-3">
        <label className="text-xs font-medium text-gray-500">Estilo deseado</label>
        <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={3}
          placeholder="p. ej. minimalista, tonos tierra, tipografía serif elegante…"
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
      </div>

      {/* Dos botones: desde texto / desde landing (este, solo si hay .zip importado) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => generate(style.trim())} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--acc)] px-3 py-2 text-sm font-medium text-[var(--acc)] hover:bg-[var(--hover-bg)] hover:text-[var(--hover-text)] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar prompt
        </button>
        <button type="button" onClick={() => generate(landingDescription())} disabled={busy || !hasLanding}
          title={hasLanding ? `Captura los estilos de "${landingSource}"` : 'Importa un .zip de landing para activarlo'}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--gold,#b8860b)] px-3 py-2 text-sm font-medium text-[var(--gold,#b8860b)] hover:bg-[color-mix(in_srgb,var(--gold,#b8860b)_10%,transparent)] disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} Generar desde landing
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Estos tokens no se cargan al cliente (trabajo del operador).</p>

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
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--acc)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
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
