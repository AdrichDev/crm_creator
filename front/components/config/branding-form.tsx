'use client';
import { useRef, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { Card, CardBody } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import type { DesignTokens } from '@/lib/config/tenant-config';
import { Image as ImageIcon, FileArchive, Loader2, Sparkles, Check } from 'lucide-react';

type Patch = Partial<{ primary: string; secondary: string; logoText: string; logoImage: string; logoImage2: string; designSource: string; tokens: DesignTokens }>;

interface Props {
  primary: string;
  secondary: string;
  logoText: string;
  logoImage?: string;
  /** Segunda imagen de marca: cabecera de documentos imprimibles (fallback → logoImage). */
  logoImage2?: string;
  designSource?: string;
  onChange: (patch: Patch) => void;
  /** Bloque que se renderiza JUSTO debajo de "Importar diseño" (p. ej. Sugerir branding con IA). */
  aiSlot?: ReactNode;
}

// Extrae una paleta del CSS de la landing (heurística: variables de marca primero,
// si no, los colores hex más frecuentes que no sean casi blanco/negro).
function extractPalette(css: string): { primary?: string; secondary?: string } {
  const out: { primary?: string; secondary?: string } = {};
  const varRe = /--[\w-]*(?:primary|brand|accent|gold|main)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi;
  const vars: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(css))) vars.push(m[1]);
  if (vars[0]) out.primary = vars[0];
  if (vars[1]) out.secondary = vars[1];
  if (out.primary && out.secondary) return out;

  // Fallback: hex más frecuentes, descartando neutros.
  const counts = new Map<string, number>();
  const hexRe = /#[0-9a-fA-F]{6}\b/g;
  while ((m = hexRe.exec(css))) {
    const hex = m[0].toLowerCase();
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 240 && min > 240) continue; // casi blanco
    if (max < 25) continue;               // casi negro
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  out.primary = out.primary ?? sorted[0];
  out.secondary = out.secondary ?? sorted[1] ?? sorted[0];
  return out;
}

export function BrandingForm({ primary, secondary, logoText, logoImage, logoImage2, designSource, onChange, aiSlot }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const logo2Ref = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  function onLogoFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ logoImage: String(reader.result) });
    reader.readAsDataURL(file);
  }

  // Imagen de marca 2 (cabecera de documentos imprimibles): campo INDEPENDIENTE de logoImage.
  function onLogo2File(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ logoImage2: String(reader.result) });
    reader.readAsDataURL(file);
  }

  // Aplica los tokens que devuelve la IA (la landing manda) a la config.
  function applyTokens(tokens: DesignTokens, fileName: string) {
    const pal = tokens.palette ?? {};
    onChange({
      primary: pal.primary ?? primary,
      secondary: pal.secondary ?? secondary,
      designSource: fileName,
      tokens,
    });
    const bits = [pal.primary, pal.secondary].filter(Boolean).join(' · ');
    const extra = [
      tokens.typography?.body && 'tipografía',
      tokens.shape?.radius && 'forma',
    ].filter(Boolean).join(', ');
    setNote(`IA · diseño de "${fileName}" aplicado${bits ? `: ${bits}` : ''}${extra ? ` (+ ${extra})` : ''}.`);
  }

  async function onZipFile(file?: File) {
    if (!file) return;
    setBusy(true); setNote(null);
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const files: { name: string; content: string }[] = [];
      const reads: Promise<void>[] = [];
      zip.forEach((p, entry) => {
        if (/\.(css|html?)$/i.test(p) && !entry.dir) {
          reads.push(entry.async('string').then((t) => { files.push({ name: p, content: t }); }));
        }
      });
      await Promise.all(reads);
      if (files.length === 0) { setNote('El zip no contiene HTML/CSS legibles.'); return; }

      // 1) Si la API está activa, la IA de OperaOS lee el estilo completo de la landing.
      if (isApiEnabled()) {
        try {
          // Recorta cada archivo para no exceder el límite de body del back.
          const payload = files.map((f) => ({ name: f.name, content: f.content.slice(0, 40_000) }));
          const r = await apiFetch<{ source: string; tokens: DesignTokens | null; message?: string }>(
            '/branding/extract', { method: 'POST', body: JSON.stringify({ files: payload }) });
          if (r.source === 'ai' && r.tokens) { applyTokens(r.tokens, file.name); return; }
          // r.source === 'none' → IA no configurada en el back; caemos a heurística.
        } catch (e) {
          setNote(`IA no disponible (${e instanceof Error ? e.message : 'error'}). Usando heurística local…`);
        }
      }

      // 2) Fallback offline: heurística por regex (solo paleta).
      const css = files.map((f) => f.content).join('\n');
      const pal = extractPalette(css);
      if (pal.primary) {
        onChange({ primary: pal.primary, secondary: pal.secondary ?? secondary, designSource: file.name });
        setNote((prev) => (prev ? prev + ' ' : '') + `Paleta extraída de "${file.name}": ${pal.primary}${pal.secondary ? ' · ' + pal.secondary : ''}.`);
      } else {
        setNote('No se encontraron colores claros en el zip. Ajusta la paleta a mano.');
      }
    } catch {
      setNote('No se pudo leer el zip.');
    } finally {
      setBusy(false);
    }
  }

  // Estado de cada paso de la cadena de montaje (para los indicadores numerados).
  const steps = [
    { n: 1, label: "Importar diseño", done: !!designSource },
    { n: 2, label: "Imagen de marca", done: !!logoImage },
    { n: 3, label: "Imagen de marca 2", done: !!logoImage2 },
    { n: 4, label: "Colores", done: !!primary },
  ];

  return (
    <div className="space-y-4">
      {/* Cabecera de la cadena de montaje: progreso por pasos */}
      <Card><CardBody className="flex flex-wrap items-center gap-2 py-3">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
              s.done ? 'bg-[var(--brand-primary)] text-white' : 'bg-gray-100 text-gray-500')}>
              {s.done ? <Check className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span className={cn('text-xs font-medium', s.done ? 'text-gray-800' : 'text-gray-400')}>{s.label}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-gray-200" />}
          </div>
        ))}
      </CardBody></Card>

      {/* Paso 1 — Importar diseño de la landing (zip) */}
      <Card><CardBody className="space-y-3">
        <StepHead n={1} title="Importar diseño de la landing" hint="Sube el .zip de la landing; la IA lee su estilo (paleta, tipografía y forma) y lo aplica al CRM." />
        <div className="rounded-xl border border-dashed border-gray-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-400"><Sparkles className="h-4 w-4 text-[var(--gold)]" /> Archivo .zip</p>
              {designSource
                ? <p className="mt-1 text-[11px] text-gray-400">Diseño actual: {designSource}</p>
                : <p className="mt-1 text-[11px] text-gray-400">Aún no has importado ningún diseño.</p>}
            </div>
            <button type="button" onClick={() => zipRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} Importar .zip
            </button>
            <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={(e) => onZipFile(e.target.files?.[0] ?? undefined)} />
          </div>
          {note && <p className="mt-2 text-xs text-gray-600">{note}</p>}
        </div>
        {/* Sugerir branding con IA: justo debajo de importar diseño de la landing. */}
        {aiSlot}
      </CardBody></Card>

      {/* Paso 2 — Imagen de marca para el sidebar */}
      <Card><CardBody className="space-y-3">
        <StepHead n={2} title="Imagen de marca" hint="Se usará en el sidebar del CRM. Si no la pones, se muestran las iniciales." />
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl text-lg font-bold text-white" style={{ background: primary }}>
            {logoImage ? <img src={logoImage} alt="logo" className="h-full w-full object-cover" /> : (logoText || '··')}
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500">Iniciales (si no hay imagen)</label>
            <input value={logoText} maxLength={3} onChange={(e) => onChange({ logoText: e.target.value.toUpperCase() })}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => logoRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <ImageIcon className="h-4 w-4" /> Imagen de marca
            </button>
            {logoImage && <button type="button" onClick={() => onChange({ logoImage: undefined })} className="text-[11px] text-red-600 hover:underline">Quitar imagen</button>}
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0] ?? undefined)} />
          </div>
        </div>
      </CardBody></Card>
      {/* Paso 3 — Imagen de marca 2: cabecera de documentos imprimibles */}
      <Card><CardBody className="space-y-3">
        <StepHead n={3} title="Imagen de marca 2" hint="Se usará como imagen de cabecera tanto en presupuesto, albaranes o facturas. En caso de no seleccionar imagen se usa la imagen de marca (paso 2)." />
        <div className="flex items-center gap-4">
          {/* Previsualización: la propia imagen 2 si existe; si no, la imagen de marca
              del paso 2 atenuada como pista del fallback (nunca iniciales). */}
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl text-lg font-bold text-white" style={{ background: primary }}>
            {logoImage2
              ? <img src={logoImage2} alt="imagen de cabecera" className="h-full w-full object-cover" />
              : logoImage
                ? <img src={logoImage} alt="imagen de marca (fallback)" className="h-full w-full object-cover opacity-40" />
                : <span className="text-[10px] font-medium text-white/80">cabecera</span>}
          </div>
          <div className="flex-1">
            {!logoImage2 && (
              <p className="text-[11px] text-gray-400">
                Sin imagen propia: usa la imagen de marca del paso 2 como cabecera.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => logo2Ref.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <ImageIcon className="h-4 w-4" /> Imagen de marca 2
            </button>
            {logoImage2 && <button type="button" onClick={() => onChange({ logoImage2: undefined })} className="text-[11px] text-red-600 hover:underline">Quitar imagen</button>}
            <input ref={logo2Ref} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo2File(e.target.files?.[0] ?? undefined)} />
          </div>
        </div>
      </CardBody></Card>

      {/* Paso 4 — Colores / paleta (ajuste final) */}
      <Card><CardBody className="space-y-3">
        <StepHead n={4} title="Colores" hint="Se rellenan al importar el .zip; ajústalos a mano si hace falta." />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-gray-500">Color principal</label>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={primary} onChange={(e) => onChange({ primary: e.target.value })} className="h-10 w-12 rounded border border-gray-300" />
              <input value={primary} onChange={(e) => onChange({ primary: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Color secundario</label>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={secondary} onChange={(e) => onChange({ secondary: e.target.value })} className="h-10 w-12 rounded border border-gray-300" />
              <input value={secondary} onChange={(e) => onChange({ secondary: e.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      </CardBody></Card>
    </div>
  );
}

/** Cabecera de paso: número + título + descripción. */
function StepHead({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)]/10 text-sm font-bold text-[var(--brand-primary)]">{n}</span>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
    </div>
  );
}
