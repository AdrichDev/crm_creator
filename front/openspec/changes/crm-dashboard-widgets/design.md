# Design: Inicio configurable con widgets favoritos + agenda multi-vista

## Visual Design (frontend-design)

El CRM ya tiene un sistema de marca por tenant (`--acc`, `--brand-secondary`, fuentes
de `tokens.typography`, radios de `tokens.shape`) — **no se inventa una paleta nueva**:
sería inconsistente que el inicio "hablara" un idioma visual distinto al resto del
panel del mismo negocio. La distinción de este cambio no viene del color sino de una
**gramática de layout que el CRM no usa hoy**: mosaico de tamaños fijos (sm/md/lg) al
estilo widget de pantalla de inicio móvil (iOS Home Screen / Android App Widgets),
con esquinas más redondeadas que el resto del chrome (`--radius-widget: 22px` vs los
`8-12px` habituales) y una "ficha glanceable": icono + cifra grande + etiqueta corta,
sin necesidad de entrar al módulo para saber el dato.

**Signature**: el widget Agenda ocupa siempre la celda `lg` (2×2) y es el único con
contenido interactivo completo (cambia de vista); todos los demás son fichas de
**un vistazo, sin interacción** (solo un link de salida). Ese contraste deliberado
—un widget "vivo" rodeado de fichas "quietas"— es el elemento memorable de la pantalla,
no una decoración añadida.

**Token system** (heredado, no nuevo):
- Color: `--acc` (primario tenant), `--brand-secondary` (hover, ya cableado en sidebar),
  `--panel-card` (fondo de ficha), `--panel-muted` (texto secundario).
- Type: hereda `--heading-font`/`--brand-font-heading` para la cifra grande del widget;
  cuerpo en la fuente de panel ya usada en `Stat`.
- Layout: grid `repeat(4, 1fr)` en desktop, `repeat(2, 1fr)` en mobile; spans por tamaño
  (sm=1×1, md=2×1, lg=2×2); `gap: 1rem`; radio `22px` exclusivo de `.widget-tile`.
- Signature: contraste agenda interactiva (lg) vs. fichas glanceable (sm/md) quietas.

```
Desktop (4 cols)              Mobile (2 cols)
┌────────────┬─────┬─────┐    ┌─────┬─────┐
│            │ sm  │ sm  │    │ sm  │ sm  │
│  Agenda lg │     │     │    ├─────┴─────┤
│  (2x2)     ├─────┴─────┤    │ Agenda lg │
│            │   md      │    │  (2x2)    │
└────────────┴───────────┘    ├─────┬─────┤
                               │ md (full) │
                               └───────────┘
```

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Persistencia de selección | Campo `dashboardWidgets: WidgetId[]` en `TenantConfig` (localStorage) | Tabla backend nueva | Todo el config de negocio ya vive en `TenantConfig` front-only (`modules`, `workerChips`); no hay backend para esto hoy y añadir uno solo para esta feature es desproporcionado |
| Límite de 6 | Validado en UI (deshabilitar checkbox) + `slice(0,6)` defensivo al leer | Validar solo en UI | Config persistida puede venir de versión anterior o editada a mano; el `slice` evita que un dato corrupto rompa el grid |
| Librería de calendario | Construir mes/semana/día a mano con utilidades de fecha ya usadas en `/panel` | `react-big-calendar` / `FullCalendar` | El repo no tiene dependencias de calendario; el mes actual ya resuelve el cálculo de celdas sin librería — extenderlo a semana/día es una función más, no una dependencia nueva |
| Fuente de datos del widget Agenda | Misma colección mock `citas` vía `useCollection`, igual que `/panel` hoy | Nueva colección "eventos" genérica | `citas` ya es genérico de facto (el label cambia por vertical); crear una segunda colección duplicaría datos sin necesidad |
| Catálogo de widgets | Patrón `WORKER_CHIPS`/`activeWorkerChips` replicado (`DASHBOARD_WIDGETS`/`activeDashboardWidgets`) | Sistema nuevo de plugins | Patrón ya probado en el repo, mismo equipo lo mantiene, menor superficie de revisión |
| Tamaño de widget | Fijo por catálogo (`size: 'sm'\|'md'\|'lg'`), no elegible por el admin | Tamaño configurable por widget | El admin elige *qué* widgets, no *cómo* se ven — añadir tamaño configurable duplica la superficie de UI sin pedido explícito (YAGNI) |

## Data Flow

    Configuración → toggleDashboardWidget(id)
      │ ya hay 6 activos y no está activo → no-op (UI deshabilita el checkbox)
      ▼
    setConfig({ dashboardWidgets: [...] })  → persiste en localStorage (igual que workerChips)
      ▼
    /panel → activeDashboardWidgets(config.dashboardWidgets, config.modules)
      │ filtra por dependsOn módulo activo, igual que workerChipAvailable
      ▼
    <WidgetGrid> → por cada widget activo, <WidgetTile size=...><WidgetById id=.../></WidgetTile>
      │
      ▼ (solo widget 'agenda')
    <AgendaWidget> → useState<vista: mes|semana|dia> → useCollection<Cita>('citas')
      → calcula celdas según vista → click día/hora → detalle inline (igual que hoy en mes)

## File Changes

| File | Action | Description |
|---|---|---|
| `front/lib/config/dashboard-widgets.ts` | Create | `WidgetId` union, `WidgetDef[]` (id, label, description, icon, size, dependsOn?), `emptyDashboardWidgets()`, `activeDashboardWidgets()` |
| `front/lib/config/tenant-config.ts` | Modify | Campo `dashboardWidgets: WidgetId[]`; merge defensivo `slice(0,6)` en `loadTenantConfig`; default por vertical (subset de `defaultModules` ya cubiertos) |
| `front/components/panel/widget-grid.tsx` | Create | Grid responsive + mapeo `WidgetId → componente`, tamaño vía clase `.widget-sm/md/lg` |
| `front/components/panel/widgets/agenda-widget.tsx` | Create | Calendario mes/semana/día (extrae y generaliza la lógica de mes que hoy vive en `panel/page.tsx`) |
| `front/components/panel/widgets/kpis-widget.tsx` | Create | KPIs de hoy (total/confirmadas/pendientes) — hoy fijo en `/panel`, pasa a opcional |
| `front/components/panel/widgets/proximos-widget.tsx` | Create | Próximas 5 citas/entrenamientos ordenadas por fecha+hora |
| `front/components/panel/widgets/clientes-nuevos-widget.tsx` | Create | Últimos clientes/socios dados de alta (`dependsOn: 'clientes'`) |
| `front/components/panel/widgets/ventas-hoy-widget.tsx` | Create | Total vendido hoy (`dependsOn: 'ventas'`) |
| `front/components/panel/widgets/facturacion-widget.tsx` | Create | Facturas pendientes de cobro (`dependsOn: 'facturas'`) |
| `front/components/panel/widgets/vacaciones-widget.tsx` | Create | Ausencias pendientes de aprobar (`dependsOn: 'vacaciones'`) |
| `front/app/(crm)/panel/page.tsx` | Modify | `PanelDashboard` usa `<WidgetGrid>`; se conserva `ClienteDashboard` intacto (no tiene widgets, es otra vista) |
| `front/app/(crm)/configuracion/page.tsx` | Modify | Nueva sección "Widgets del inicio" — grid tipo `WorkerChipsGrid` con contador `n/6` |
| `app/globals.css` | Modify | `.widget-tile`, `.widget-sm/md/lg`, `.widget-grid` (radio 22px, spans) |

## Interfaces / Contracts

```ts
// lib/config/dashboard-widgets.ts
export type WidgetId =
  | 'agenda' | 'kpis-hoy' | 'proximos-eventos' | 'clientes-nuevos'
  | 'ventas-hoy' | 'facturacion-pendiente' | 'vacaciones-pendientes'
  | 'ocupacion-semana';
// 'cumpleanos' descartado en implementación: Cliente (mock) no tiene fecha de
// nacimiento; añadir el campo era scope creep no pedido. Catálogo final: 8 ids.

export interface WidgetDef {
  id: WidgetId;
  label: string;
  description: string;
  icon: string;          // lucide-react
  size: 'sm' | 'md' | 'lg';
  dependsOn?: ModuleId;   // igual semántica que WorkerChipDef.dependsOn
}

export const MAX_DASHBOARD_WIDGETS = 6;
export function activeDashboardWidgets(ids: WidgetId[], modules: Record<ModuleId, boolean>): WidgetDef[];
```

```ts
// agenda-widget.tsx
type VistaAgenda = 'mes' | 'semana' | 'dia';
// reutiliza Cita { id, cliente, servicio, empleado, fecha: 'YYYY-MM-DD', hora, estado }
```

`TenantConfig.dashboardWidgets: WidgetId[]` — default por vertical: los 6 widgets más
relevantes según `defaultModules` de ese vertical (ej. `centro-deportivo` → `agenda,
kpis-hoy, proximos-eventos, clientes-nuevos, ventas-hoy, vacaciones-pendientes`).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (vitest/RTL si existe, si no — node:test sobre funciones puras) | Cálculo de celdas semana/día (días correctos, lunes=0, cruce de mes) | Tests de la función pura de cálculo, extraída de `AgendaWidget` |
| Unit | `activeDashboardWidgets` respeta `dependsOn` y máximo 6 | Igual que `activeWorkerChips` ya probado por patrón |
| Front | Selector en Configuración deshabilita al llegar a 6 | Render + click en `WorkerChipsGrid`-like component |
| Front | `/panel` sin widgets seleccionados → empty state con CTA | Render con `dashboardWidgets: []` |

## Migration / Rollout

Sin migración de BD. Migración de **config local**: usuarios con `TenantConfig` ya en
localStorage no tienen `dashboardWidgets` → `loadTenantConfig` aplica default por
vertical la primera vez que cargan (mismo patrón ya usado para `workerChips` cuando
se introdujo). Reversible borrando el campo o restaurando `/panel/page.tsx` desde git.

## Open Questions

- [ ] Defaults por vertical de `dashboardWidgets` — ¿los defino yo en tasks o los revisa
  el usuario antes de aplicar? (afecta qué ve un negocio nuevo el primer día)
- [ ] ¿El widget Agenda en vista semana/día necesita franja horaria (ej. 08:00–20:00) o
  basta con listar las citas del día agrupadas por hora sin grid horario fijo?
