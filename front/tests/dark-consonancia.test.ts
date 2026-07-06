import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const GLOBALS_CSS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
const VERTICAL_PICKER = readFileSync(join(ROOT, 'components/config/vertical-picker.tsx'), 'utf8');
const MODULE_TOGGLE_GRID = readFileSync(join(ROOT, 'components/config/module-toggle-grid.tsx'), 'utf8');
const CLIENT_COMBOBOX = readFileSync(join(ROOT, 'components/config/client-combobox.tsx'), 'utf8');
const AI_BRANDING_SUGGEST = readFileSync(join(ROOT, 'components/config/ai-branding-suggest.tsx'), 'utf8');

// crm-dark-consonancia-onboarding WU1 (AC1): las tarjetas seleccionadas (vertical
// picker, module toggle grid) usan un color-mix SÓLIDO sobre --panel-card en vez
// de transparent — si no, se ve la rejilla de fondo a través de la tarjeta.
describe('WU1 · cards seleccionadas sólidas (AC1)', () => {
  it('vertical-picker.tsx: color-mix de selección resuelve sobre var(--panel-card)', () => {
    expect(VERTICAL_PICKER).toMatch(/color-mix\(in srgb, var\(--gold\) 14%, var\(--panel-card\)\)/);
  });

  it('vertical-picker.tsx: no queda transparent en el estilo de selección', () => {
    const selectionStyleLine = VERTICAL_PICKER.split('\n').find((l) => l.includes('backgroundColor') && l.includes('color-mix'));
    expect(selectionStyleLine).toBeDefined();
    expect(selectionStyleLine).not.toMatch(/%, transparent\)/);
  });

  it('module-toggle-grid.tsx: color-mix de selección (gold) y de icono (categoría) resuelven sobre var(--panel-card)', () => {
    expect(MODULE_TOGGLE_GRID).toMatch(/color-mix\(in srgb, var\(--gold\) 12%, var\(--panel-card\)\)/);
    expect(MODULE_TOGGLE_GRID).toMatch(/color-mix\(in srgb, \$\{color\} 16%, var\(--panel-card\)\)/);
  });

  it('module-toggle-grid.tsx: no queda transparent en los estilos de selección/icono', () => {
    const styleLines = MODULE_TOGGLE_GRID.split('\n').filter((l) => l.includes('backgroundColor') && l.includes('color-mix'));
    expect(styleLines.length).toBeGreaterThan(0);
    for (const line of styleLines) expect(line).not.toMatch(/%, transparent\)/);
  });
});

// WU2 (AC2): los remaps de hover en .onboarding usan los tokens --hover-* (nunca
// --panel-bg, que en oscuro es negro casi puro) y cubren border-gray-300/text-gray-600.
describe('WU2 · hover con tokens en .onboarding (AC2)', () => {
  it('hover\\:bg-gray-50/100 resuelven a var(--hover-bg), no a var(--panel-bg)', () => {
    const rule = GLOBALS_CSS.slice(
      GLOBALS_CSS.indexOf('.onboarding .hover\\:bg-gray-50:hover'),
      GLOBALS_CSS.indexOf('}', GLOBALS_CSS.indexOf('.onboarding .hover\\:bg-gray-50:hover')) + 1,
    );
    expect(rule).toMatch(/background-color:\s*var\(--hover-bg\)/);
    expect(rule).not.toMatch(/var\(--panel-bg\)/);
  });

  it('existe remap .onboarding .hover\\:border-gray-300:hover → var(--hover-border)', () => {
    expect(GLOBALS_CSS).toMatch(/\.onboarding \.hover\\:border-gray-300:hover\s*\{\s*border-color:\s*var\(--hover-border\);?\s*\}/);
  });

  it('existe remap .onboarding .hover\\:text-gray-600:hover → var(--hover-text)', () => {
    expect(GLOBALS_CSS).toMatch(/\.onboarding \.hover\\:text-gray-600:hover\s*\{\s*color:\s*var\(--hover-text\);?\s*\}/);
  });
});

// WU3 (AC3): en oscuro, ningún tinte de aviso queda en su color Tailwind fijo
// (bg-amber-50/100, bg-red-50, bg-emerald-50) sin remap scoped a .crm-console,
// que también cubre .onboarding (rejilla .crm-console.onboarding).
describe('WU3 · tintes de aviso theme-aware (AC3)', () => {
  const DARK_ONLY_SCOPE = ':root:not([data-theme="light"]) .crm-console';

  // Excepción pedida por el usuario (02/07): el banner ámbar "Generar descarga"
  // conserva su ámbar original sólido en ambos temas — NO debe tener remap oscuro.
  it('el ámbar del banner "Generar descarga" NO tiene remap oscuro (excepción usuario)', () => {
    expect(GLOBALS_CSS).not.toContain(`${DARK_ONLY_SCOPE} .bg-amber-50`);
    expect(GLOBALS_CSS).not.toContain(`${DARK_ONLY_SCOPE} .bg-amber-100`);
    expect(GLOBALS_CSS).not.toContain(`${DARK_ONLY_SCOPE} .border-amber-200`);
    expect(GLOBALS_CSS).not.toContain(`${DARK_ONLY_SCOPE} .text-amber-900`);
  });

  it('bg-red-50 tiene remap scoped a .crm-console solo en oscuro', () => {
    expect(GLOBALS_CSS).toContain(`${DARK_ONLY_SCOPE} .bg-red-50`);
    expect(GLOBALS_CSS).toContain(`${DARK_ONLY_SCOPE} .border-red-200`);
    expect(GLOBALS_CSS).toContain(`${DARK_ONLY_SCOPE} .text-red-700`);
  });

  it('bg-emerald-50 tiene remap scoped a .crm-console solo en oscuro', () => {
    expect(GLOBALS_CSS).toContain(`${DARK_ONLY_SCOPE} .bg-emerald-50`);
    expect(GLOBALS_CSS).toContain(`${DARK_ONLY_SCOPE} .text-emerald-700`);
  });

  it('el remap oscuro no toca el bloque :root[data-theme="light"] (el claro conserva el tinte original)', () => {
    const lightBlockStart = GLOBALS_CSS.indexOf(':root[data-theme="light"] {');
    const lightBlockEnd = GLOBALS_CSS.indexOf('\n}\n', lightBlockStart);
    const lightBlock = GLOBALS_CSS.slice(lightBlockStart, lightBlockEnd);
    expect(lightBlock).not.toMatch(/bg-amber-50|bg-red-50|bg-emerald-50/);
  });
});

// WU4 (AC4): no debe quedar el azul fuera de marca #2563eb en estos dos ficheros;
// todo pasa a var(--acc) (sólido) o a los tokens --hover-*.
describe('WU4 · azul #2563eb reemplazado por tokens de marca (AC4)', () => {
  it('client-combobox.tsx no contiene #2563eb', () => {
    expect(CLIENT_COMBOBOX).not.toMatch(/#2563eb/i);
  });

  it('ai-branding-suggest.tsx no contiene #2563eb', () => {
    expect(AI_BRANDING_SUGGEST).not.toMatch(/#2563eb/i);
  });

  it('client-combobox.tsx: opción activa usa var(--acc) mezclado sobre var(--panel-card)', () => {
    expect(CLIENT_COMBOBOX).toMatch(/color-mix\(in_srgb,var\(--acc\)_14%,var\(--panel-card\)\)/);
  });

  it('ai-branding-suggest.tsx: hover azul reemplazado por tokens --hover-*', () => {
    expect(AI_BRANDING_SUGGEST).toMatch(/hover:bg-\[var\(--hover-bg\)\]/);
  });
});

// WU6 (orden usuario 02/07): el hover del sidebar del panel no puede leerse
// "oscuro" con NINGÚN color de marca. --acc-light es el secundario del tenant y
// puede ser oscuro, así que el hover usa contraste invertido: superficie sobre
// --panel-text teñida con el secundario + letras en --panel-bg.
describe('WU6 · hover del sidebar con contraste invertido a prueba de tenant', () => {
  it('.opera-sidebar-links a:hover mezcla --acc-light sobre --panel-text y letra --panel-bg', () => {
    const start = GLOBALS_CSS.indexOf('.opera-sidebar-links a:hover');
    const rule = GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf('}', start) + 1);
    expect(rule).toMatch(/background:\s*color-mix\(in srgb, var\(--acc-light\) \d+%, var\(--panel-text\)\)/);
    expect(rule).toMatch(/color:\s*var\(--panel-bg\)/);
    expect(rule).not.toMatch(/var\(--hover-bg\)/);
    expect(rule).not.toMatch(/%, transparent\)/);
  });
});

// crm-cita-gris (regresión reportada varias veces): Fecha/Hora/Comentarios de Nueva Cita
// se veían en el color equivocado porque DOS reglas con la MISMA especificidad
// (`.crm-cita-modal input[...]` y `.crm-modal-panel input[...]`) competían por cascada —
// la que iba después en el archivo ganaba en silencio y pisaba el gris. El selector
// COMBINADO `.crm-modal-panel.crm-cita-modal` tiene más especificidad que cualquiera de
// las dos por separado, así que gana siempre, sin depender del orden en el archivo.
describe('crm-cita-gris · Fecha/Hora/Comentarios grises en ambos temas (selector a prueba de cascada)', () => {
  it('usa el selector combinado .crm-modal-panel.crm-cita-modal (no solo .crm-cita-modal)', () => {
    expect(GLOBALS_CSS).toMatch(/\.crm-modal-panel\.crm-cita-modal input\[type="date"\]/);
    expect(GLOBALS_CSS).toMatch(/\.crm-modal-panel\.crm-cita-modal input\[type="time"\]/);
  });

  it('la regla cubre también textarea (Comentarios) y pinta con --panel-muted (gris theme-aware)', () => {
    const start = GLOBALS_CSS.indexOf('.crm-modal-panel.crm-cita-modal input[type="date"]');
    const rule = GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf('}', start) + 1);
    expect(rule).toMatch(/\.crm-modal-panel\.crm-cita-modal textarea/);
    expect(rule).toMatch(/color:\s*var\(--panel-muted\)/);
  });

  // Regresión (2ª vuelta del mismo bug): el fondo quedaba BLANCO porque la regla ponía
  // `background-color: transparent` confiando en que el <form> padre resolviera bien su
  // propio fondo (y no lo hacía). Ahora el fondo es EXPLÍCITO (--panel-card), sin depender
  // de ningún padre.
  it('fija un fondo EXPLÍCITO (--panel-card), no "transparent"', () => {
    const start = GLOBALS_CSS.indexOf('.crm-modal-panel.crm-cita-modal input[type="date"]');
    const rule = GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf('}', start) + 1);
    expect(rule).toMatch(/background-color:\s*var\(--panel-card\)/);
    expect(rule).not.toMatch(/background-color:\s*transparent/);
  });

  it('no queda un selector .crm-cita-modal SIN combinar (ambigüedad de cascada reintroducida)', () => {
    expect(GLOBALS_CSS).not.toMatch(/(?<!\.crm-modal-panel)\.crm-cita-modal input\[type="date"\]/);
  });
});
