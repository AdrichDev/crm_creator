# Tareas — crm-sidebar-comercial-naming

Alcance: front-only. Orden: tipos → config vertical → sidebar. Ruflo gate antes de push.

## WU1 — Override de categoría por vertical
- [x] 1.1 `VerticalDef.moduleCategories?: Partial<Record<ModuleId, ModuleCategory>>` en
      `lib/config/verticals` (front + shared si aplica).
- [x] 1.2 Helper puro `effectiveCategory(vertical, moduleId)` (override ?? `MODULE_MAP[id].category`)
      + test unit.

## WU2 — Naming y defaults del vertical `comerciales`
- [x] 2.1 Terminología del vertical: comercial→"Mapa comercial", clientes→"Cartera de clientes",
      citas→"Agenda", ventas→"Pedidos", estadisticas→"Informes".
- [x] 2.2 `moduleCategories: { comercial: 'core' }` en el vertical `comerciales`.
- [x] 2.3 `defaultModules` del vertical: on = dashboard, clientes, comercial, citas,
      configuracion, mi-cuenta; resto off (activable).
- [x] 2.4 Test deserialize: defaults nuevos sin pisar overrides guardados.

## WU3 — Sidebar
- [x] 3.1 Extraer agrupado del sidebar a helper puro `groupModules(active, vertical)` que usa
      `effectiveCategory`; `sidebar.tsx` y `module-grid-panel` lo consumen.
- [x] 3.2 Test unit de agrupado (orden de grupos + comercial en Esencial solo en `comerciales`).

## Cierre
- [x] Z.1 front tests + tsc limpios (42 archivos / 303 tests verdes; `tsc --noEmit` sin errores).
      Smoke visual con Playwright PENDIENTE (fuera de esta pasada — requiere levantar el front).
- [x] Z.2 Ruflo review HECHO (02/07/2026, junto a los otros 2 changes): sin hallazgos en este
      change; 🟡 informativo sobre reducción de defaultModules — cubierto por tests (módulos
      quedan activables). Sin commit todavía.
