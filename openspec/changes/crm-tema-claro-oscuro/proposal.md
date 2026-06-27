# Proposal — Tema solo claro/oscuro (crm-tema-claro-oscuro)

**Nivel Gru: 1 — Small.** Front, local, reversible. 1 dominio (UI/tema).

## Contexto
El tema del CRM tiene 3 modos: `system | light | dark` (`front/lib/theme/crm-theme.ts` + botón cíclico `theme-toggle.tsx`). El modo "Sistema" **no funciona bien** y confunde. agents-agency ya usa solo **claro/oscuro** (`data-theme` + localStorage, toggle directo).

## Intención
Quitar el modo `system`. Dejar **solo `light` y `dark`**. Toggle directo (claro ↔ oscuro), alineado con el patrón de agents-agency.

## Alcance
- `front/lib/theme/crm-theme.ts`: `CrmMode = 'light' | 'dark'`. Quitar `system`, `resolveMode` (ya no hace falta resolver SO), y el listener de `prefers-color-scheme` en `initTheme`.
- `front/components/layout/theme-toggle.tsx`: toggle binario (sin `Monitor`/"Sistema"). Iconos Sol/Luna.
- Migración suave de preferencia guardada: si en localStorage había `system`, resolver una vez a `dark` (default actual del proyecto) y persistir.
- `front/tests/crm-theme.test.ts`: actualizar a los 2 modos.

## Fuera de alcance
- Cambiar la paleta de colores o los tokens CSS.
- Tocar el tema de agents-agency (ya correcto).

## Riesgos
- Usuarios con `system` guardado → se normaliza a `dark` en el primer load. Aceptable.

## Decisión
Default cuando no hay preferencia: **`dark`** (coherente con el default actual del proyecto).
