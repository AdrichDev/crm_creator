# Tasks — crm-views-roles

> Change: `crm-views-roles` · Nivel 2

## V1. Tipos y config
- [x] V1.1 En `front/lib/config/tenant-config.ts`: añadir `BusinessViews = { worker: boolean; client: boolean }` y `DEFAULT_VIEWS`
- [x] V1.2 Añadir campo `views?: BusinessViews` al tipo `TenantConfig` (o al objeto de config, allí donde viven `modules` y `branding`)
- [x] V1.3 En `configFromVertical(...)` devolver `views: DEFAULT_VIEWS` en el config inicial

## V2. Módulos de personas marcados
- [x] V2.1 En `front/lib/config/modules.ts`: añadir `requiresWorkerView?: boolean` a `ModuleDef`
- [x] V2.2 Marcar `empleados`, `fichaje`, `vacaciones` con `requiresWorkerView: true`

## V3. ModuleToggleGrid
- [x] V3.1 Añadir props `views: BusinessViews` y `onViewsChange: (v: BusinessViews) => void`
- [x] V3.2 Renderizar selector de vistas encima de la rejilla (Admin siempre activo/disabled, Trabajador y Cliente editables)
- [x] V3.3 Al toggle Trabajador OFF: llamar `onToggle(m.id, false)` para todos los módulos `requiresWorkerView`
- [x] V3.4 Módulos con `requiresWorkerView && !views.worker`: `disabled`, `opacity-40`, `title="Requiere vista Trabajador"`

## V4. Onboarding
- [x] V4.1 En `onboarding/page.tsx`: estado `views` inicializado de `editing.config.views ?? DEFAULT_VIEWS`
- [x] V4.2 Función `changeViews(v)`: actualiza `views` + desactiva módulos de personas si `!v.worker`
- [x] V4.3 Pasar `views` y `onViewsChange={changeViews}` a `<ModuleToggleGrid>`
- [x] V4.4 Incluir `views` en el draft de config que se envía al crear/editar proyecto

## Cierre
- [x] Z1 `cd front && npx tsc --noEmit` — 0 errores
- [x] Z2 `cd front && npm test -- --run` — todos verdes
