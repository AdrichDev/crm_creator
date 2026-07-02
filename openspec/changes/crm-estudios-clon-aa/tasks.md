# Tasks — crm-estudios-clon-aa

## ESTADO: PROPUESTA — sin iniciar
Solo existe `proposal.md`. Checklist derivada del proposal; NINGUNA tarea iniciada ni
verificada. Sin `validation.md` ni `design.md` aún.

## Fase 1 — Proxy CRM
- [ ] 1.1 `app/api/market-studies/[...path]/route.ts`: reenvía GET/POST/PATCH a AA con
  `aaFetch` (Bearer `AA_SERVICE_TOKEN`). NO reenvía DELETE (404/405). Propaga 402/4xx.

## Fase 2 — Data layer CRM
- [ ] 2.1 `lib/api/market-studies.ts`: cliente que pega al proxy (listar/ver/generar/iterar/
  secciones/prospects).

## Fase 3 — UI (port de AA, reusando lo existente del CRM)
- [ ] 3.1 Portar `components/stats/StudiesPanel.tsx` (lista) adaptando data calls al proxy.
- [ ] 3.2 Portar `StudyIterationPanel.tsx` (detalle: generar/iterar/secciones/prospects).
- [ ] 3.3 Portar componentes que falten (StatusBadge, RecommendedOptionsSection, …) reusando
  los que el CRM ya tiene (study-detail, prospects-table, prospects-adjust-panel,
  study-section-editor, structured-content, star-rating).
- [ ] 3.4 Página de detalle nueva: `app/(crm)/estadisticas/[id]/page.tsx`.
- [ ] 3.5 Sustituir el flujo `useCollection('estudios')` (localStorage) por la lista real.
- [ ] 3.6 Ocultar/deshabilitar el botón "borrar" (AA bloquea DELETE de market-studies).
- [ ] 3.7 Reutilizar tema/markup del CRM (clases opera/`--panel-*`), sin romper claro/oscuro.

## Verificación
- [ ] V.1 `tsc` + `next build` verde.
- [ ] V.2 Revisión visual del flujo (listar/ver/generar/iterar/secciones/prospects) contra AA.
- [ ] V.3 Unit tests del data layer (`lib/api/market-studies.ts`).
