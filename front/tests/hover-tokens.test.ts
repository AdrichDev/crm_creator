import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const GLOBALS_CSS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');

// crm-modales-hover-unificados WU1: tokens de hover theme-aware derivados del
// color secundario de marca. Deben existir en :root (oscuro) y redefinirse en
// :root[data-theme="light"] con el dorado profundo legible sobre lino.
describe('WU1 · tokens de hover en :root y :root[data-theme="light"]', () => {
  const rootBlock = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf(':root {'), GLOBALS_CSS.indexOf('\n}\n', GLOBALS_CSS.indexOf(':root {')));
  const lightBlock = GLOBALS_CSS.slice(
    GLOBALS_CSS.indexOf(':root[data-theme="light"] {'),
    GLOBALS_CSS.indexOf('\n}\n', GLOBALS_CSS.indexOf(':root[data-theme="light"] {')),
  );

  it('AC1 · :root (oscuro) define --hover-bg, --hover-text y --hover-border', () => {
    expect(rootBlock).toMatch(/--hover-bg:/);
    expect(rootBlock).toMatch(/--hover-text:/);
    expect(rootBlock).toMatch(/--hover-border:/);
  });

  it('AC1 · :root[data-theme="light"] redefine los tres tokens con dorado profundo', () => {
    expect(lightBlock).toMatch(/--hover-bg:/);
    expect(lightBlock).toMatch(/--hover-text:/);
    expect(lightBlock).toMatch(/--hover-border:/);
  });
});

// WU2 (AC3): ningún selector :hover de globals.css debe usar blancos/negros
// directos como feedback principal — deben ir sobre los tokens de hover o
// color-mix con --acc/--acc-light. Los hovers semánticos (danger/approve/etc.)
// se excluyen explícitamente.
describe('WU2 · globals.css sin blancos/negros directos en :hover (AC3)', () => {
  const SEMANTIC_HOVER_EXCEPTIONS = [
    '.row-action.danger:hover',
    '.row-action.approve:hover',
    '.btn-logout:hover', // relleno con --acc, no blanco/negro directo
  ];

  it('los selectores :hover no fijan background/color en blanco o negro puros fuera de excepciones', () => {
    const hoverRuleRe = /([^{}]*:hover[^{}]*)\{([^}]*)\}/g;
    const offenders: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = hoverRuleRe.exec(GLOBALS_CSS))) {
      const [, selector, body] = match;
      if (SEMANTIC_HOVER_EXCEPTIONS.some((ex) => selector.includes(ex))) continue;
      const usesRawWhiteOrBlack = /:\s*#fff\b/i.test(body) || /:\s*white\b/i.test(body) || /:\s*#000\b/i.test(body) || /:\s*black\b/i.test(body);
      if (usesRawWhiteOrBlack) offenders.push(selector.trim());
    }
    expect(offenders).toEqual([]);
  });
});

// WU2 (AC2): ningún componente .tsx del CRM (panel opera) usa las utilidades
// Tailwind prohibidas. Excepciones documentadas: páginas fuera del panel CRM
// (auth/portal cliente) y componentes de diseño ligero compartidos con el
// onboarding (protegido, fuera de scope de este change).
describe('WU2 · componentes .tsx sin utilidades hover prohibidas (AC2)', () => {
  const FORBIDDEN_PATTERNS = [
    /hover:text-white\b/,
    /hover:bg-white\//,
    /hover:bg-gray-\d+/,
    /hover:text-gray-\d+/,
    /hover:border-gray-\d+/,
  ];

  // Documented exceptions — fuera del panel opera del CRM o fuera de scope del change.
  const EXCEPTIONS = new Set([
    'app/login/page.tsx', // auth pública, tarjeta blanca, no usa tokens --panel-*
    'app/registro/page.tsx', // ídem
    'app/forgot-password/page.tsx', // ídem
    'app/me/layout.tsx', // portal de cliente, explícitamente "not the CRM panel"
    'components/config/client-combobox.tsx', // fuera de scope (proposal: popover, no modal)
    'components/ui/emoji-picker.tsx', // fuera de scope (proposal: popover, no modal)
    'components/config/vertical-picker.tsx', // solo usado en onboarding (protegido)
    'components/config/module-toggle-grid.tsx', // solo usado en onboarding (protegido)
    'components/config/branding-form.tsx', // tarjeta clara compartida con onboarding
    'components/config/ai-branding-suggest.tsx', // tarjeta clara compartida con onboarding
  ]);

  function collectTsxFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === '.next') continue;
        collectTsxFiles(full, out);
      } else if (entry.endsWith('.tsx')) {
        out.push(full);
      }
    }
    return out;
  }

  it('no quedan utilidades hover:text-white / hover:bg-white/… / hover:*-gray-* fuera de las excepciones documentadas', () => {
    const files = [...collectTsxFiles(join(ROOT, 'app')), ...collectTsxFiles(join(ROOT, 'components'))];
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (EXCEPTIONS.has(rel)) continue;
      const content = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) offenders.push(`${rel} (${pattern})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// WU7 (AC7): todo backdrop de modal aplica un blur pequeño al fondo, en ambos
// temas. `.opera-modal-backdrop` (chasis opera + dialog-provider tras WU4) y los
// tres modales "nueva-*" (que conservan su propio overlay tras la decisión de
// WU3) deben incluir la regla/utilidad de blur.
describe('WU7 · backdrop de todo modal con blur (AC7)', () => {
  it('.opera-modal-backdrop en globals.css aplica backdrop-filter: blur', () => {
    const rule = GLOBALS_CSS.slice(
      GLOBALS_CSS.indexOf('.opera-modal-backdrop {'),
      GLOBALS_CSS.indexOf('}', GLOBALS_CSS.indexOf('.opera-modal-backdrop {')),
    );
    expect(rule).toMatch(/backdrop-filter:\s*blur\(/);
  });

  const NUEVA_MODALS = [
    'components/crm/nueva-cita-modal.tsx',
    'components/crm/nueva-clase-modal.tsx',
    'components/crm/nueva-entrenamiento-modal.tsx',
  ];

  it.each(NUEVA_MODALS)('%s aplica blur en su overlay propio (bg-black/…)', (rel) => {
    const content = readFileSync(join(ROOT, rel), 'utf8');
    const backdropLine = content.split('\n').find((l) => /bg-black\//.test(l));
    expect(backdropLine).toBeDefined();
    expect(backdropLine).toMatch(/backdrop-blur/);
  });
});

// WU8: los <input type="date"/"time"> nativos del panel deben usar el chroma
// del tema (color-scheme + fondo/texto de --panel-*) en vez del blanco por
// defecto del navegador — regla global a nivel de `.opera-shell`, cubre tanto
// `opera-control` (EntityModal) como el `inputCls` sin bg/text de "nueva-*".
describe('WU8 · inputs de fecha/hora theme-aware (fix "se ven en blanco")', () => {
  it('.opera-shell define color-scheme + fondo/texto de tema para input[type="date"/"time"]', () => {
    const ruleStart = GLOBALS_CSS.indexOf('.opera-shell input[type="date"]');
    expect(ruleStart).toBeGreaterThan(-1);
    const rule = GLOBALS_CSS.slice(ruleStart, GLOBALS_CSS.indexOf('}', ruleStart));
    expect(rule).toMatch(/color-scheme:\s*dark/);
    expect(rule).toMatch(/background-color:\s*var\(--panel-card\)/);
    expect(rule).toMatch(/color:\s*var\(--panel-text\)/);
  });

  it(':root[data-theme="light"] redefine color-scheme a light para esos inputs', () => {
    const lightRuleStart = GLOBALS_CSS.indexOf(':root[data-theme="light"] .opera-shell input[type="date"]');
    expect(lightRuleStart).toBeGreaterThan(-1);
    const rule = GLOBALS_CSS.slice(lightRuleStart, GLOBALS_CSS.indexOf('}', lightRuleStart));
    expect(rule).toMatch(/color-scheme:\s*light/);
  });
});
