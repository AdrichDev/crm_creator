# Tasks — crm-cliente-estadisticas-fixes

## Fase 1 — Quick wins seguros
- [x] 1.1 Colores tabla tema-safe: `text-gray-900` → `text-[var(--panel-text)]` en
  `citas`, `fichaje`, `marketing`, `productos`, `servicios`, `vacaciones`.
- [x] 1.2 Estadísticas: eliminar stat "Tokens consumidos", columna Tokens y nota de tokens.
- [x] 1.3 Estadísticas: eliminar stat "Cliente vinculado".
- [x] 1.4 Marketing: eliminar nota de coste de tokens.
- [x] 1.5 globals.css: fondo de rejilla en `.opera-shell` + `--grid-color` claro/oscuro.

## Fase 2 — Tema claro/oscuro completo en dashboard
- [x] 2.1 Componentes nuevos (KPIs, gráficas, tablas) usan tokens `--panel-*`/`--line`
  → válidos en claro y oscuro sin overrides extra.
- [x] 2.2 Toggle de tema ya disponible en el header (`ThemeToggle`).
- [x] 2.3 Revisar contraste de badges/acentos en ambos temas (overrides `:root[data-theme="light"] .tone-*` en globals.css, AA ≥4.5:1).

## Fase 3 — Clon de Estadísticas (agents-agency)
- [x] 3.1 `recharts` en `package.json` del front (instalado).
- [x] 3.2 `lib/stats/aggregate.ts`: KPIs + series mensuales + facturación + donuts.
- [x] 3.3 `components/stats/*` re-tematizados: `bar-chart` (recharts) + `donut-chart`.
- [x] 3.4 `estadisticas/page.tsx` con pestañas Dashboard + Estudios + drilldown por mes.
- [x] 3.5 Tests vitest del agregador (`lib/stats/__tests__/aggregate.test.ts`, 13 tests verde).

## Fase 4 — Estudios de mercado + Marketing estructurado
- [x] 4.1 `components/stats/structured-content.tsx` (render markdown-ish por secciones).
- [x] 4.2 Detalle de estudio usa `StructuredContent` (sin tokens visibles).
- [x] 4.3 Marketing: `generarPlan()` renderiza estudio estructurado, no `<pre>`.

## Fase 5 — Vista cliente
- [x] 5.1 `Factura.servicio` en `lib/mock/data.ts` + seed.
- [x] 5.2 Facturas: en `role==='cliente'` oculta "Cliente", muestra "Tratamiento"
  (tabla + modal). Idéntico para todos los verticales.
- [x] 5.3 Dashboard de cliente: clon de "Mis Citas" de JorjotasBarber en
  `panel/page.tsx` para `role==='cliente'` (stats + tabla sin nombre + anular).

## Verificación final
- [x] V.1 `npm test` (vitest) verde — 40/40, 7 archivos. `tsc --noEmit` limpio + `next build` OK.
- [ ] V.2 Revisión visual claro/oscuro en `npm run dev`. (Código verificado theme-safe 2026-06-17: páginas del scope sin colores hardcodeados — el único residual del scope es `bg-white/[0.03]` translúcido, válido en ambos temas; los residuales `text-gray-900` están en config/onboarding, fuera de este change. Pendiente solo el vistazo humano.)
- [x] V.3 Admin no ve tokens en ninguna pantalla (eliminados de Estadísticas/Marketing).
