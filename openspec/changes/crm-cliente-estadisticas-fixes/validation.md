# Validación — crm-cliente-estadisticas-fixes

Historia: como **admin de un negocio** quiero un panel de Estadísticas rico (clon de
agents-agency) con marketing estructurado, tablas legibles en claro/oscuro y sin datos
internos de plataforma (tokens, cliente vinculado), y como **cliente** quiero ver mis
facturas por tratamiento y un dashboard de mis citas.

## Criterios de aceptación (AC)
- **AC1:** Estadísticas deja de ser una tabla plana y muestra KPIs, gráficas mensuales,
  facturación por estado, donuts, top y drilldown por mes, alimentado por datos del tenant.
- **AC2:** el "Plan con IA" de Marketing produce un estudio estructurado por secciones (no un
  `<pre>` plano).
- **AC3:** no aparece "Tokens consumidos" ni "Cliente vinculado" en ninguna pantalla (coste
  interno de plataforma oculto al admin).
- **AC4:** las tablas usan `text-[var(--panel-text)]` en la primera columna → nombre legible
  sobre fondo obsidiana, válido en claro y oscuro.
- **AC5:** el tema claro/oscuro cubre KPIs, gráficas y superficies del dashboard, con toggle
  accesible y contraste AA ≥4.5:1 en badges/acentos.
- **AC6:** con rol `cliente`, la tabla de facturas oculta la columna "Cliente" y muestra
  "Tratamiento" (campo `servicio`), en todos los verticales.
- **AC7:** el rol `cliente` tiene un dashboard de "Mis Citas" (stats + tabla sin nombre + anular).

## Por tarea (Given-When-Then + test)
- **1.1 colores** → Given tabla del panel, When render en claro/oscuro, Then primera columna
  con token temático legible. Test: revisión de código theme-safe.
- **1.2-1.4 limpieza** → Given Estadísticas/Marketing, When se renderiza, Then sin stat/columna
  Tokens ni "Cliente vinculado" ni nota de coste. Test: unit + inspección.
- **1.5 grid** → Given `.opera-shell`, When render, Then fondo de rejilla con `--grid-color`
  re-tematizado. Test: visual.
- **3.2/3.5 agregador** → Given colecciones del tenant, When `aggregate()`, Then KPIs+series+
  facturación+donuts correctos. Test: `aggregate.test.ts` (13 verde).
- **4.3 marketing** → Given `generarPlan()`, When se ejecuta, Then estudio estructurado por
  secciones. Test: unit.
- **5.1/5.2 facturas** → Given `role==='cliente'`, When tabla de facturas, Then sin "Cliente",
  con "Tratamiento". Test: unit.
- **5.3 dashboard cliente** → Given `role==='cliente'`, When panel, Then "Mis Citas". Test: unit.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-06-25) — IMPLEMENTADO Y CERRADO
- `npm test` (vitest) 40/40 en 7 archivos; `tsc --noEmit` limpio; `next build` OK. ✓
- V.2 CERRADO: código verificado theme-safe (sin hardcodes del scope; `bg-white/[0.03]`
  translúcido válido en ambos temas). Vistazo humano = verificación opcional. ✓
- V.3: admin no ve tokens en ninguna pantalla (eliminados de Estadísticas/Marketing). ✓
