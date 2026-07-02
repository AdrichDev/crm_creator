# Tareas: crm-dark-consonancia-onboarding

- [x] WU1 — Cards seleccionadas sólidas
  - `components/config/vertical-picker.tsx` (selección L14) y
    `components/config/module-toggle-grid.tsx` (L49 selección, L52 icono):
    `color-mix(in srgb, var(--gold) 14%, transparent)` → `color-mix(in srgb, var(--gold) 14%, var(--panel-card))`.
  - Test correspondiente en `tests/dark-consonancia.test.ts` verde.

- [x] WU2 — Hover con tokens en `.onboarding`
  - `app/globals.css`: `hover\:bg-gray-50:hover` y `hover\:bg-gray-100:hover` →
    `background-color: var(--hover-bg)` (antes `--panel-bg`).
  - Añadir: `.onboarding .hover\:border-gray-300:hover { border-color: var(--hover-border); }`
    y `.onboarding .hover\:text-gray-600:hover { color: var(--hover-text); }`.
  - Test verde.

- [x] WU3 — Tintes de aviso theme-aware
  - `app/globals.css`, scoped `.onboarding` y `.crm-console`, SOLO tema oscuro (el claro ya
    se ve bien con los tintes originales): remap de `bg-amber-50`, `bg-amber-100`,
    `border-amber-200`, `text-amber-900`, `text-amber-800` (si aparece), `bg-red-50`,
    `border-red-200`, `text-red-700`, `bg-emerald-50` + texto/borde esmeralda asociado,
    siguiendo el patrón de los `.tone-*` oscuros (fondo translúcido del color sobre carta,
    texto claro del color).
  - Ojo: el oscuro es el tema por defecto SIN `data-theme="light"`, así que el remap va en
    reglas base scoped y el claro se restaura con `:root[data-theme="light"]` si hace falta
    (o remap solo bajo `:root:not([data-theme="light"])`).
  - Test verde.

- [x] WU4 — Azul `#2563eb` → tokens de marca
  - `components/config/client-combobox.tsx` (opción activa L125): tinte/texto activo con
    `var(--acc)` (mezcla sobre `--panel-card`, sólida, coherente con WU1).
  - `components/ai/ai-branding-suggest.tsx` o ruta real (`components/config/ai-branding-suggest.tsx`)
    L138: hover azul → tokens `--hover-*`.
  - Test verde (grep `#2563eb` vacío).

- [x] WU6 — Correcciones en vivo del usuario (02/07)
  - Banner ámbar "Generar descarga" (dashboard): revertido el remap oscuro — conserva su
    ámbar original sólido (`bg-amber-50`) en ambos temas. Test AC ámbar invertido
    (asegura que NO exista remap).
  - Hover del sidebar del panel (`.opera-sidebar-links a:hover`): de tinte translúcido
    `--hover-bg` (se leía "hover oscuro") a relleno sólido `var(--acc-light)` + texto
    oscuro fijo. Test nuevo en `tests/dark-consonancia.test.ts`.

- [x] WU5 — Verificación
  - Suite completa del front verde (`npm test` / vitest según proyecto — usar el runner ya
    configurado en package.json).
  - Sin cambios de layout/UX: mismos componentes, mismas clases estructurales.
