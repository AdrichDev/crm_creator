# Proposal: Inicio configurable con widgets favoritos + agenda multi-vista

## Intent

Hoy `/panel` es una pantalla fija: KPIs fijos + un calendario mensual con mock de
`citas`. No hay forma de elegir qué se ve en el inicio, y el calendario solo tiene
vista de mes (sin semana/día). El admin quiere un catálogo amplio de widgets, elegir
hasta 6 favoritos, verlos con un estilo tipo "widget de móvil" (iOS/Android), y que
el widget de agenda tenga vistas mes/semana/día. Las referencias del calendario
(entrenamientos/clases/reuniones/citas) ya cambian por vertical vía `terminology.citas`
(`lib/config/verticals.ts`) — este cambio reutiliza ese mecanismo, no lo duplica.

## Scope

### In Scope
- Catálogo de widgets de inicio (`lib/config/dashboard-widgets.ts`), mismo patrón que
  `worker-chips.ts`: catálogo + selección persistida en `TenantConfig` + selector "activos".
- Selección de hasta 6 widgets favoritos desde Configuración (grid con límite, igual
  convención que `WorkerChipsGrid`).
- Rediseño de `/panel` (rol admin/trabajador-con-permiso): grid de mosaico estilo
  widget móvil (tamaños sm/md/lg), renderiza solo los widgets activos.
- Widget "Agenda": calendario con 3 vistas (mes / semana / día), navegación entre
  vistas y entre periodos, usa el término de `citas` ya resuelto por vertical.
- 5-9 widgets adicionales del catálogo (KPIs, próximos eventos, clientes nuevos,
  ventas hoy, facturación pendiente, vacaciones pendientes, cumpleaños/altas recientes).
- Persistencia front-only (localStorage vía `TenantConfig`, mismo motor que hoy).

### Out of Scope
- Drag&drop de posición de widgets (orden fijo por catálogo en esta fase).
- Backend/API para los widgets (todos consumen colecciones mock ya existentes vía
  `useCollection`, igual que `WorkerChips` y `/panel` actual).
- Vista de "agenda" como módulo independiente nuevo (ya existe `/citas`); el widget
  es un resumen/atajo, no sustituye esa pantalla.
- Edición de `terminology` o `VERTICALS` (ya soportan el cambio de referencia por sector).

## Capabilities

### New Capabilities
- `dashboard-widgets`: catálogo + selección (máx. 6) + grid de mosaico en `/panel`.
- `agenda-multi-vista`: calendario con vistas mes/semana/día dentro del widget Agenda.

### Modified Capabilities
- `panel-dashboard`: `/panel` pasa de layout fijo a grid dirigido por config.

## Approach

Mismo patrón ya validado por `WORKER_CHIPS`/`activeWorkerChips`: catálogo tipado
(`DASHBOARD_WIDGETS`), campo nuevo en `TenantConfig` (`dashboardWidgets: WidgetId[]`,
máx. 6, persistido en localStorage junto al resto de config), función `activeDashboardWidgets`
que filtra por selección + módulo dependiente activo. El widget "Agenda" es el único
con lógica nueva real (vistas semana/día); el resto son variaciones de tarjetas que ya
existen como patrón (`WorkerChips`, `Stat`). Sin librería de calendario externa — se
construye con el mismo enfoque de grid CSS que ya usa `/panel` (mes), extendido a semana/día.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `front/lib/config/dashboard-widgets.ts` | New | Catálogo `WidgetId`, metadatos, tamaño (sm/md/lg), `dependsOn` módulo |
| `front/lib/config/tenant-config.ts` | Modified | Campo `dashboardWidgets: WidgetId[]` (máx. 6) + merge/migración de config existente |
| `front/components/panel/widget-grid.tsx` | New | Grid de mosaico (tamaños) + switch de widget por id |
| `front/components/panel/widgets/agenda-widget.tsx` | New | Calendario mes/semana/día |
| `front/components/panel/widgets/*.tsx` | New | Resto de widgets del catálogo (KPIs, próximos, etc.) |
| `front/app/(crm)/panel/page.tsx` | Modified | Sustituye layout fijo por `WidgetGrid` |
| `front/app/(crm)/configuracion/page.tsx` | Modified | Selector de widgets favoritos (máx. 6) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Selección de más de 6 widgets | Med | Bloquear checkbox al llegar a 6 (deshabilitado, no error) |
| Vertical sin módulos suficientes para 6 widgets útiles | Med | `dependsOn` oculta widgets sin módulo activo; default set por vertical con los que sí aplican |
| Migración de `TenantConfig` ya persistida en localStorage de clientes existentes | Low | Merge defensivo igual que `workerChips` (`{...defaults, ...parsed}`) |
| Calendario semana/día sin librería → bugs de cálculo de fechas | Med | Reutilizar utilidades ya probadas de `/panel` (mes) y añadir tests de unidad para semana/día |

## Rollback Plan

Front-only y aditivo: revertir `dashboardWidgets` del `TenantConfig` (vuelve al layout
fijo anterior si se quita el campo), borrar `widget-grid.tsx`/`widgets/*` y restaurar
`/panel/page.tsx` desde git. No hay migración de BD ni endpoints nuevos que revertir.

## Dependencies

- `lib/config/verticals.ts` (terminología por sector, ya existe).
- `lib/data/use-collection.ts` (mock collections, ya existe).
- `lib/config/worker-chips.ts` como patrón de referencia (no se modifica).

## Success Criteria

- [ ] Admin elige hasta 6 widgets en Configuración; al 7º intento el checkbox está deshabilitado.
- [ ] `/panel` renderiza solo los widgets activos en grid de mosaico (tamaños sm/md/lg).
- [ ] Widget Agenda cambia entre vista mes/semana/día sin perder el día seleccionado.
- [ ] Las referencias del widget Agenda muestran el término correcto por vertical (Entrenamientos/Clases/Reuniones/Citas) sin tocar `verticals.ts`.
- [ ] Sin widgets seleccionados → empty state con CTA a Configuración (no pantalla vacía muda).
