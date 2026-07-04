# Tasks — crm-estudios-clon-aa

## ESTADO: APLICADO — Fases 1-3 verificadas en código (2026-07-04)
Proxy, data layer y UI ya implementados y confirmados por lectura directa del repo.
`validation.md` con AC Gherkin. Pendiente solo V.1 (tsc/build) y V.2 (revisión visual manual).

## Fase 1 — Proxy CRM
- [x] 1.1 `app/api/market-studies/[...path]/route.ts`: reenvía GET/POST/PATCH a AA con
  `aaFetch` (Bearer `AA_SERVICE_TOKEN`). NO reenvía DELETE (405). Propaga 402/4xx.

## Fase 2 — Data layer CRM
- [x] 2.1 `lib/api/market-studies.ts`: cliente que pega al proxy (listar/ver/generar/iterar/
  secciones/prospects). Verificado con unit tests (`tests/market-studies.test.ts`).

## Fase 3 — UI (port de AA, reusando lo existente del CRM)
- [x] 3.1 Portado `components/stats/studies-panel.tsx` (lista) adaptando data calls al proxy.
- [x] 3.2 Portado `study-iteration-panel.tsx` (detalle: generar/iterar/secciones/prospects).
- [x] 3.3 Portados componentes que faltaban (study-status-badge, recommended-options-section,
  study-prospects-table, study-prospects-adjust-panel, study-section-editor-remote, star-rating).
- [x] 3.4 Página de detalle nueva: `app/(crm)/estadisticas/estudios/[id]/page.tsx`.
- [x] 3.5 Sustituido el flujo `useCollection('estudios')` (localStorage) por `StudiesPanel` real.
- [x] 3.6 Botón "borrar" ausente en la lista (no se portó); proxy además responde 405 a DELETE.
- [x] 3.7 Tema/markup del CRM reutilizado (`panel`, `--panel-*`, `row-action`), sin tema propio.

## Verificación
- [ ] V.1 `tsc` + `next build` verde.
- [ ] V.2 Revisión visual del flujo (listar/ver/generar/iterar/secciones/prospects) contra AA.
- [x] V.3 Unit tests del data layer (`lib/api/market-studies.ts`) — `tests/market-studies.test.ts`.
