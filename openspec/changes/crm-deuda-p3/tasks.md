# Tareas — crm-deuda-p3

## WU1 — dedup model-effort (front)
- [x] T1.1 Componente único `components/ai/model-effort.tsx` con prop `variant: 'opera' | 'config'` (encapsula LLM_PROVIDERS/REASONING_EFFORTS/modelSupportsEffort + rejilla select/optgroup). Props `model, effort, onModel, onEffort`.
- [x] T1.2 Los 3 call-sites migrados a `ModelEffort`: `estadisticas/estudios/nuevo/page.tsx` (opera), `marketing/page.tsx` (opera), `config/ai-branding-suggest.tsx` (config).
- [x] T1.3 Componentes viejos `model-effort-select.tsx` y `model-effort-picker.tsx` eliminados. Sin imports huérfanos (tsc limpio).
- [x] T1.4 `tests/model-effort.test.tsx`: ambas variantes pintan modelos/efforts; effort `disabled` cuando el modelo no lo soporta. 7 tests verde.

## WU2 — projects POST (back)
- [x] T2.1 `reviveProject` y `createProject` extraídas como funciones privadas en `routes/projects.ts`; `POST /` delega. Respuesta/estado/códigos sin cambio.
- [x] T2.2 `$transaction` + espejo config→columnas (`mirrorColumns`) + membership conservados.

## Verificación
- [x] tsc limpio (back + front).
- [x] CRM back tests (node:test) verde (75 unit).
- [x] CRM front vitest verde (179, incl. model-effort 7). `next build` cubierto por CI en main (rama ya mergeada).

## Estado: COMPLETO. Refactor puro, sin cambio de comportamiento. Revisado (Ruflo + Devil's Advocate, ver nota).
