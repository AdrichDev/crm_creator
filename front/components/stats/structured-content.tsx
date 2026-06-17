'use client';
import { Fragment, type ReactNode } from 'react';

// Render ligero de contenido tipo markdown (sin dependencias) para mostrar los
// planes/estudios generados con IA como secciones, al estilo del estudio de
// mercado de agents-agency, en lugar de un <pre> plano.

function inline(text: string, keyBase: string) {
  // **negrita** → <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return <strong key={`${keyBase}-b${i}`} className="font-semibold text-[var(--panel-text)]">{p.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyBase}-t${i}`}>{p}</Fragment>;
  });
}

export function StructuredContent({ content, className }: { content: string; className?: string }) {
  const lines = (content ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    const current = bullets;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-1 space-y-1">
        {current.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm text-[var(--panel-text)]">
            <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--acc)' }} />
            <span>{inline(b, `li-${blocks.length}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) { flushBullets(); return; }

    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      flushBullets();
      const level = h[1].length;
      const txt = h[2].replace(/[*_`]/g, '');
      blocks.push(
        <h3 key={`h-${idx}`} className={level <= 2
          ? 'mt-1 text-base font-semibold text-[var(--acc)]'
          : 'mt-1 text-sm font-semibold text-[var(--panel-text)]'}>{txt}</h3>,
      );
      return;
    }

    if (/^[-*•]\s+/.test(t)) { bullets.push(t.replace(/^[-*•]\s+/, '')); return; }

    const num = /^(\d+)[.)]\s+(.*)$/.exec(t);
    if (num) { bullets.push(num[2]); return; }

    // "Título:" en su propia línea → subtítulo
    if (/^[^:]{2,40}:$/.test(t)) {
      flushBullets();
      blocks.push(<h4 key={`s-${idx}`} className="mt-1 text-sm font-semibold text-[var(--panel-text)]">{t.slice(0, -1)}</h4>);
      return;
    }

    flushBullets();
    blocks.push(<p key={`p-${idx}`} className="text-sm leading-relaxed text-[var(--panel-text)]">{inline(t, `p-${idx}`)}</p>);
  });
  flushBullets();

  return <div className={`space-y-3 ${className ?? ''}`}>{blocks}</div>;
}
