# Tasks — crm-tema-claro-oscuro (Nivel 1)

## T1 — Lógica de tema
- [ ] T1.1 `front/lib/theme/crm-theme.ts`: `CrmMode = 'light' | 'dark'`. Quitar `system` de los tipos y de `loadMode` (valor inválido/`system` → `dark`). Eliminar `resolveMode` (o reducir a identidad) y `systemPrefersDark` si quedan sin uso.
- [ ] T1.2 `initTheme()`: aplicar el modo guardado; eliminar el listener de `prefers-color-scheme` (ya no se sigue al SO).
- [ ] T1.3 `saveMode`/`applyMode`: setean `document.documentElement.dataset.theme` con `light|dark` directo.

## T2 — Toggle UI
- [ ] T2.1 `front/components/layout/theme-toggle.tsx`: `NEXT = { light: 'dark', dark: 'light' }`. Quitar `Monitor` y la etiqueta "Sistema". Icono Sol (light) / Luna (dark).

## T3 — Tests
- [ ] T3.1 `front/tests/crm-theme.test.ts`: cubrir solo `light|dark`; preferencia `system` legada → `dark`. Verde.

## Verificación
- [ ] V.1 Toggle alterna claro↔oscuro y persiste en reload.
- [ ] V.2 localStorage con `system` previo → carga como `dark` sin romper.
- [ ] V.3 `tsc` + tests front verde.

## Tras verde: gate Ruflo antes de commit.
