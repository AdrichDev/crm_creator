# Proposal — crm-cliente-estadisticas-fixes

## Why

El panel generado (creador_CRM) tiene varios defectos reportados por el usuario:

1. **Estadísticas pobres**: la página de Estadísticas es una tabla plana de "estudios"
   con tokens. No clona el panel de Estadísticas de **agents-agency** (KPIs, gráficas
   mensuales, facturación, donuts, top, drilldown, estudios de mercado interactivos).
2. **Marketing cutre**: el plan de marketing no está enfocado igual que el nuevo
   estudio de mercado de agents-agency (secciones, iteración, valoración).
3. **Tokens visibles al admin**: el admin del negocio no debe ver "Tokens consumidos"
   (coste interno de plataforma). Hay que eliminarlo.
4. **"Cliente vinculado"**: dato de plataforma que no aporta al negocio. Eliminar.
5. **Colores de tablas**: la primera columna usa `text-gray-900` → invisible sobre el
   fondo obsidiana. "Las tablas no cogen bien el nombre".
6. **Modo claro/oscuro** sólo está pulido en el chrome; falta en el dashboard/panel.
7. **Fondo de rejilla** como agents-agency (grid sutil sobre el fondo).
8. **Lógica de facturas/clientes en vista cliente**: si el rol es `cliente`, todas las
   facturas son suyas → no debe aparecer la columna "Cliente"; en su lugar el
   tratamiento/servicio recibido. Válido para todos los verticales y servicios.
9. **Dashboard de cliente**: clonar el dashboard de cliente de **JorjotasBarberTFG**.

## What Changes

- **Estadísticas (clon agents-agency)**: pestañas Dashboard + Estudios de mercado.
  KPIs, gráficas (actividad mensual, facturación por estado), donuts, top, drilldown,
  y estudios de mercado interactivos con secciones/valoración. Alimentado por datos
  del tenant (mock/colecciones) sin depender del backend de agents-agency.
- **Marketing**: el "Plan con IA" produce un estudio estructurado por secciones al
  estilo del estudio de mercado (no un `pre` plano).
- **Tokens**: eliminados de Estadísticas y Marketing (stat, columna y notas).
- **"Cliente vinculado"**: eliminado de Estadísticas.
- **Colores**: sustituir `text-gray-900`/`text-white` fijos en tablas del panel por
  el token temático `text-[var(--panel-text)]` (válido en claro y oscuro).
- **Tema claro/oscuro**: extender el `data-theme` a KPIs, gráficas y superficies del
  dashboard; toggle accesible desde el panel.
- **Fondo de rejilla**: añadir el patrón grid de agents-agency al shell del panel,
  con `--grid-color` re-tematizado en claro/oscuro.
- **Facturas/Clientes (vista cliente)**: añadir `servicio` (tratamiento) al modelo de
  Factura; en rol `cliente` ocultar columna "Cliente" y mostrar "Tratamiento".
- **Dashboard de cliente**: nueva vista de cliente clonando JorjotasBarberTFG
  (citas próximas, historial, datos), adaptada al sistema de temas del CRM.

## Impact

- Affected specs: `estadisticas`, `marketing`, `facturas`, `clientes`, `theme`,
  `dashboard-cliente`.
- Affected code (creador_CRM/front):
  - `app/(panel)/estadisticas/page.tsx` (+ nuevos `components/stats/*`)
  - `app/(panel)/marketing/page.tsx`
  - `app/(panel)/facturas/page.tsx`, `app/(panel)/clientes/page.tsx`
  - `app/(panel)/panel/page.tsx` (dashboard) y vista cliente
  - `app/globals.css` (grid + tema), `lib/mock/data.ts` (campo `servicio` en Factura)
  - tablas con `text-gray-900`: `citas`, `fichaje`, `marketing`, `productos`,
    `servicios`, `vacaciones`.
- Riesgo: medio-alto (toca varios dominios y datos). Reversible (feature branch).
  Sin migraciones de BD reales (mock/colecciones en localStorage).
