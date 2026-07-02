# Propuesta: consonancia total claro/oscuro en onboarding y consola

## Intención

Orden directa del usuario (02/07/2026): "En el modo oscuro no quiero ningún input, select
etc blanco; todo tiene que seguir la misma consonancia. A las tarjetas de onboarding
quítales el transparent cuando se hace onclick. Hover oscuro según la regla ya pactada."

Regla de hover vigente (crm-modales-hover-unificados): todo hover usa el color secundario
vía tokens `--hover-bg/--hover-text/--hover-border`; en claro nunca blanco, en oscuro
nunca negro.

## Alcance

Front creador_CRM, scopes `.onboarding` y `.crm-console`. Sin cambios de UX ni de
estructura (tarjetas y flujo de 4 pasos intactos — restricción dura del usuario).

1. **Cards seleccionadas sólidas**: al hacer click, el fondo seleccionado usa
   `color-mix(in srgb, var(--gold) 14%, var(--panel-card))` (sólido) en lugar de
   `..., transparent` que dejaba ver la rejilla del fondo.
   Ficheros: `components/config/vertical-picker.tsx`, `components/config/module-toggle-grid.tsx`.
2. **Hover con tokens**: los remaps `.onboarding .hover\:bg-gray-50/100:hover` pasan de
   `var(--panel-bg)` (negro en oscuro) a `var(--hover-bg)`. Se añaden remaps para
   `hover:border-gray-300` → `var(--hover-border)` y `hover:text-gray-600` → `var(--hover-text)`.
   Fichero: `app/globals.css`.
3. **Tintes de aviso theme-aware**: `bg-amber-50/100`, `border-amber-200`, `text-amber-900`,
   `bg-red-50`, `border-red-200`, `text-red-700`, `bg-emerald-50` (y sus textos/bordes
   asociados usados en dashboard/onboarding) se remapean en oscuro a los tonos oscuros ya
   existentes (patrón `.tone-*`: tinte translúcido sobre `--panel-card` + texto claro del color).
   Solo scoped a `.onboarding` y `.crm-console`. Fichero: `app/globals.css`.
4. **Azul fuera de marca → tokens**: `#2563eb` en `client-combobox.tsx` (opción activa) y
   `ai-branding-suggest.tsx` (hovers) pasa a `var(--acc)`/tokens hover.

## Fuera de alcance

- Thumb blanco del Toggle (contraste correcto sobre pista, patrón estándar).
- Hover rojo semántico del botón danger en dialog-provider (rojo intencional).
- Cualquier cambio de layout, copy o flujo del onboarding/consola.
