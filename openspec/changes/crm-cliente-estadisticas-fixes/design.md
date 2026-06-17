# Design — crm-cliente-estadisticas-fixes

## Contexto técnico

- creador_CRM/front: Next.js 15 (app router), React 19, Tailwind 3, vitest.
- Tema: `app/globals.css` con tokens `--panel-bg/--panel-card/--panel-text/--panel-muted/--acc`.
  Modo claro vía `:root[data-theme="light"]` (ya existe; falta cobertura en dashboard).
- Datos: `lib/mock/data.ts` + `useCollection` (localStorage). NO hay BD real en el front.
- Roles: `lib/config/roles.ts` → `admin | trabajador | cliente`. Vista cliente = `role==='cliente'`.
- Referencia a clonar: `agents-agency/front/app/estadisticas/*` + `components/stats/*`
  (KpiCard, MonthlyBarChart, BillingBarChart, DonutChart, TopAgentsChart, StatsFilters,
  DrilldownPanel, StudiesPanel, StudyIterationPanel, StarRating, StatusBadge,
  SectionEditor, ProspectsTable…). Usa `recharts`.

## Decisiones

### D1. Estadísticas se alimenta de datos del tenant, no del backend de agents-agency
agents-agency tira de `/api/stats` (Prisma). creador_CRM no tiene ese backend en el
front. **Decisión**: replicar la UI y derivar KPIs/series de las colecciones existentes
(`citas`, `facturas`, `ventas`, `clientes`, `servicios`, `productos`, `marketing`) con
un agregador local `lib/stats/aggregate.ts`. Mantiene la estética y la lógica de
gráficas/drilldown sin acoplar al monorepo de agents-agency.

- KPIs CRM: Clientes, Citas, Ingresos (facturas pagadas), Servicios, Productos.
- Actividad mensual: citas/ventas/facturas por mes.
- Facturación por estado: Pagada/Pendiente/Anulada por mes (mapeo del de agents-agency
  draft/sent/accepted/rejected → estados del CRM).
- Donuts: servicios por categoría, clientes por segmento.
- Drilldown: al clicar una barra, detalle del periodo.

### D2. recharts
Añadir `recharts` a dependencias del front (ya lo usa agents-agency). Componentes
`components/stats/*` portados y re-tematizados con tokens `--panel-*`/`--acc` en vez de
los neón de agents-agency, para respetar la marca por vertical.

### D3. Estudios de mercado interactivos (mock IA)
Portar `StudiesPanel` + detalle con secciones/valoración. La generación usa el cliente
IA existente (`lib/ai/usage-client`) pero **sin** exponer tokens. El resultado se
estructura en secciones (Resumen, Competencia, Oportunidades, Recomendaciones) en lugar
de texto plano. Persistencia en colección `estudios`.

### D4. Marketing como estudio estructurado
`generarPlan()` deja de volcar `out.content` en un `<pre>`; lo parsea en secciones y lo
muestra con el mismo componente de secciones del estudio de mercado. Nota de tokens
eliminada.

### D5. Tema claro/oscuro en dashboard + rejilla
- Añadir al shell del panel el grid de agents-agency:
  ```css
  .opera-shell {
    background-image:
      linear-gradient(var(--grid-color) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
    background-size: 32px 32px; background-position: center;
  }
  ```
  con `--grid-color: rgba(255,255,255,0.04)` (oscuro) y
  `:root[data-theme="light"] { --grid-color: rgba(15,23,42,0.06); }`.
- Extender overrides `data-theme="light"` a `.kpi-card`, gráficas y `.data-table`.

### D6. Colores de tabla (tema-safe)
Regla canónica: la primera celda de cada tabla usa `text-[var(--panel-text)]`
(no `text-gray-900` ni `text-white` fijos). Afecta a 6 páginas del panel.

### D7. Vista cliente en Facturas/Clientes
- Modelo: `Factura` gana `servicio?: string` (tratamiento recibido). Seed actualizado.
- `facturas/page.tsx`: si `role==='cliente'` → cabecera sin "Cliente"; columna
  "Tratamiento" con `f.servicio`. Si `role!=='cliente'` → comportamiento actual.
  El modal de detalle aplica la misma regla (oculta Cliente en vista cliente).
- Generalización: válido para todos los verticales porque `servicio` es libre.

### D8. Dashboard de cliente (clon JorjotasBarberTFG)
Fuente: `JorjotasBarberTFG/frontend/pages/citas.html` + `js/citas.js` + `css/dashboard.css`
(HTML/CSS/JS plano + Supabase). **Decisión**: reimplementar la misma estructura visual
(próximas citas, historial, ficha) como componente React tematizado en
`app/(panel)/panel/page.tsx` cuando `role==='cliente'`, usando colecciones del CRM.

## Riesgos y mitigación
- Clon de stats es amplio → fases incrementales, cada componente compila aislado.
- Sin BD real: todo deriva de colecciones mock → cero migraciones.
- Verificación: vitest (`npm test`) + revisión visual en `npm run dev` (sandbox de
  comandos caído durante la redacción; el usuario ejecuta los tests al validar cada fase).

## Plan por fases (Nivel 3)
- **Fase 1 (segura, aplicada)**: colores tabla, quitar tokens + cliente vinculado, grid bg.
- **Fase 2**: tema claro/oscuro completo en dashboard + KPIs/tablas.
- **Fase 3**: clon Estadísticas (agregador + componentes recharts + dashboard).
- **Fase 4**: estudios de mercado interactivos + marketing estructurado.
- **Fase 5**: vista cliente facturas/clientes + dashboard de cliente (clon Jorjota's).
