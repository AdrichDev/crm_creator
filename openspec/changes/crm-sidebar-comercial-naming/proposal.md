# crm-sidebar-comercial-naming

## Intención
Reorganizar el sidebar y el naming de módulos para el vertical `comerciales` (cliente CRM de
campo, doc `criterios_crm_comercial_cliente.md`): lenguaje de comercial de calle, sin jerga
genérica de SaaS ("pipeline", "cuentas", "partidas"), y grupos en orden fijo:
**Esencial → Operativa → Personas → Retail / Caja → Marketing y Web**.

## Problema
El catálogo `MODULES` tiene labels y categorías globales pensadas para el vertical genérico
(barbería/clínica). Para el comercial de campo el naming confunde: el módulo central (`comercial`,
mapa/visitas) cuelga de "Operativa" en vez de "Esencial", y labels como "Ventas / TPV" o
"Servicios" no significan nada en su operativa. La categoría de un módulo es fija por código:
no hay forma de recolocar un módulo por vertical.

## Alcance
- **A. Override de categoría por vertical:** `VerticalDef` gana `moduleCategories?: Partial<Record<ModuleId, ModuleCategory>>`.
  El sidebar y el grid de configuración resuelven categoría efectiva = override ?? global.
- **B. Naming vertical `comerciales`** (vía `terminology`, mecanismo existente):
  - `comercial` → "Mapa comercial" (hoy "Ruta comercial")
  - `clientes` → "Cartera de clientes"
  - `citas` → "Agenda"
  - `servicios` → "Tarifas" (o desactivado por defecto — ver D)
  - `ventas` → "Pedidos"
  - `estadisticas` → "Informes"
- **C. Recolocación para `comerciales`:** `comercial` → categoría `core` (Esencial). Resto sin
  cambio de grupo.
- **D. `defaultModules` del vertical `comerciales`:** activos por defecto solo los que usa un
  comercial de campo (dashboard, clientes, comercial, citas, configuracion, mi-cuenta);
  retail/marketing quedan activables pero off.
- **E. Orden de grupos:** garantizar orden Esencial → Operativa → Personas → Retail → Marketing
  (ya lo da `CATEGORY_LABEL`; se fija con test para que no se rompa).

## Fuera de alcance
Colores del mapa por gasto, seguimiento, notificaciones (→ `crm-comercial-colores-seguimiento`).
Integración calendario (→ `crm-citas-google-calendar`). Cambios de rutas/href. Módulos nuevos.

## Decisiones
- **No renombrar en código, solo en UI:** ids, hrefs y rutas quedan intactos; el naming va por
  `terminology` (mecanismo existente, cero migración).
- **Override de categoría, no duplicar catálogo:** un solo `MODULES` global + override quirúrgico
  por vertical. Evita divergencia de catálogos.
- **Deserialización tolerante:** configs guardadas de otros verticales no se ven afectadas
  (override solo aplica si el vertical lo define).

## Riesgos
- Configs de tenants ya generados con terminología persistida → el override de defaults no debe
  pisar overrides manuales del usuario (deserialize: default < guardado).

## Rollback
Cambio front-only y reversible: quitar overrides del vertical restaura el comportamiento actual.

## Dependencias
`crm-comercial-campo` (archivado/hecho). Ninguna migración de datos.

## Criterios de éxito
Sidebar del vertical `comerciales` muestra los grupos en orden con el naming nuevo; otros
verticales sin cambio visual; front tests + tsc verdes.
