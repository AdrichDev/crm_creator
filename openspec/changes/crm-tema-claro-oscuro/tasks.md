# Tasks — crm-tema-claro-oscuro (Nivel 1)

## T1 — Lógica de tema
- [x] T1.1 `lib/theme/crm-theme.ts`: `CrmMode = 'light' | 'dark'` (sin `system`). `loadMode` migra `system`/ausente → resuelto por SO una vez y persiste. `resolveMode` se conserva como contrato de migración legada (usado por test). `systemPrefersDark` sigue en uso en `loadMode`.
- [x] T1.2 `initTheme()` solo aplica el modo guardado; SIN listener de `prefers-color-scheme`.
- [x] T1.3 `saveMode`/`applyMode` setean `document.documentElement.dataset.theme` con `light|dark` directo.

## T2 — Toggle UI
- [x] T2.1 `components/layout/theme-toggle.tsx`: `NEXT = { light:'dark', dark:'light' }`. Sin `Monitor` ni "Sistema". Sol (light) / Luna (dark).

## T3 — Tests
- [x] T3.1 `tests/crm-theme.test.ts`: cubre `light|dark` + `system` legado → resuelto y persistido. 6 tests verde.

## Verificación
- [x] V.3 `tsc` + tests front verde (176 suite completa).
- [x] V.1 Toggle alterna claro↔oscuro y persiste en reload. (manual visual) — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.
- [x] V.2 localStorage con `system` previo → carga como resuelto sin romper. (cubierto por test; verificar visual) — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.

## Tras verde: gate Ruflo antes de commit.
