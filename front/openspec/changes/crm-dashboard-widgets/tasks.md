# Tasks: Inicio configurable con widgets favoritos + agenda multi-vista

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750 (config 90, widget-grid 60, agenda-widget 220, otros widgets 200 conjunto, panel/page.tsx 80, configuracion 60, css 40) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | WU1 Config+catálogo → WU2 Agenda multi-vista → WU3 Resto de widgets + grid → WU4 Configuración (selector) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU1 | Catálogo + `TenantConfig` + migración defensiva | PR 1 | Base: main; sin UI todavía, solo config/tipos |
| WU2 | `AgendaWidget` (mes/semana/día) | PR 2 | Depende de WU1; pieza más grande y de mayor riesgo (cálculo de fechas) |
| WU3 | Resto de widgets + `WidgetGrid` + CSS mosaico | PR 3 | Depende de WU1; paralelizable con WU2 |
| WU4 | `/panel/page.tsx` (integración) + selector en Configuración | PR 4 | Depende de WU2 + WU3 |

---

## Phase 1: Catálogo y config (WU1)

- [x] 1.1 `front/lib/config/dashboard-widgets.ts` (nuevo): `WidgetId` union (9 valores), `WidgetDef[]` con `label/description/icon/size/dependsOn`, `MAX_DASHBOARD_WIDGETS = 6`
- [x] 1.2 `dashboard-widgets.ts`: `emptyDashboardWidgets()` y `activeDashboardWidgets(ids, modules)` — mismo contrato que `activeWorkerChips` (spec W-S3)
- [x] 1.3 `dashboard-widgets.ts`: `defaultDashboardWidgets(verticalId): WidgetId[]` — default por vertical (resolver Open Question del design antes de codear este punto)
- [x] 1.4 `front/lib/config/tenant-config.ts`: añadir `dashboardWidgets: WidgetId[]` a `TenantConfig`; en `loadTenantConfig`, si falta → `defaultDashboardWidgets(vertical)`; si tiene >6 → `.slice(0, 6)` (spec W-S10, W-S11)

## Phase 2: Widget Agenda (WU2 — depende Phase 1)

- [x] 2.1 Extraer de `panel/page.tsx` la lógica de cálculo de celdas de mes a una función pura (`buildMonthCells(year, month): (CalCell|null)[]`) en `lib/utils/calendar.ts` (nuevo)
- [x] 2.2 `lib/utils/calendar.ts`: `buildWeekCells(date): CalCell[7]` y `buildDayCell(date): CalCell` — mismo tipo `CalCell { d, date }`
- [x] 2.3 `front/components/panel/widgets/agenda-widget.tsx` (nuevo): estado `vista: 'mes'|'semana'|'dia'`, selector de vista (3 botones), navegación de periodo (prev/next) por vista
- [x] 2.4 `agenda-widget.tsx`: al cambiar de vista, recalcular periodo para que incluya `selected` (spec W-S7)
- [x] 2.5 `agenda-widget.tsx`: vista mes = grid actual (reutilizado); semana = 7 columnas; día = lista de citas del día ordenadas por hora (spec W-S6, W-S8)
- [x] 2.6 `agenda-widget.tsx`: usar `useTerm('citas', 'Citas')` en todos los textos visibles, sin literal "Citas" (spec W-S9)
- [x] 2.7 Tests unitarios de `buildWeekCells`/`buildDayCell` (lunes=0, cruce de mes/año)

## Phase 3: Resto de widgets + grid (WU3 — depende Phase 1, paralelo a WU2)

- [x] 3.1 `front/components/panel/widgets/kpis-widget.tsx`: KPIs de hoy (extraído del bloque fijo actual de `/panel`)
- [x] 3.2 `front/components/panel/widgets/proximos-widget.tsx`: próximas 5 citas/entrenamientos por fecha+hora
- [x] 3.3 `front/components/panel/widgets/clientes-nuevos-widget.tsx` (`dependsOn: 'clientes'`)
- [x] 3.4 `front/components/panel/widgets/ventas-hoy-widget.tsx` (`dependsOn: 'ventas'`)
- [x] 3.5 `front/components/panel/widgets/facturacion-widget.tsx` (`dependsOn: 'facturas'`)
- [x] 3.6 `front/components/panel/widgets/vacaciones-widget.tsx` (`dependsOn: 'vacaciones'`)
- [x] 3.7 `front/components/panel/widget-grid.tsx` (nuevo): mapa `WidgetId → componente`, aplica clase de tamaño, empty state (spec W-S4, W-S5)
- [x] 3.8 `app/globals.css`: `.widget-grid`, `.widget-tile`, `.widget-sm/md/lg` (radio 22px, spans 1×1/2×1/2×2, responsive 2 cols mobile)

## Phase 4: Integración (WU4 — depende WU2 + WU3)

- [x] 4.1 `front/app/(crm)/panel/page.tsx`: `PanelDashboard` sustituye el bloque fijo de KPIs+calendario por `<WidgetGrid widgets={activeDashboardWidgets(...)} />`; `ClienteDashboard` queda intacto
- [x] 4.2 `front/app/(crm)/configuracion/page.tsx`: sección "Widgets del inicio" — grid de checkboxes con contador `n/6`, deshabilita al llegar al máximo (spec W-S1, W-S2), oculta/deshabilita widgets sin módulo activo (spec W-S3)

## Phase 5: Verification (Z)

- [x] 5.1 `npx tsc --noEmit` en `front/` — 0 errores
- [x] 5.2 Tests unitarios `calendar.ts` (semana/día) — todos verdes
- [x] 5.3 Comprobación visual: `/panel` con 0, 3 y 6 widgets activos; cambio de vista mes→semana→día conserva selección; término por vertical correcto en al menos 2 verticales distintos (`centro-deportivo` y `fitness`)
