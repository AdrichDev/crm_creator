# crm-comercial-campo

## Intención
Añadir la capacidad **CRM comercial de campo geolocalizado** al SaaS: mapa de clientes,
estados de visita por color/icono, categoría ABC, notas con histórico, registro de visitas,
pendientes, recordatorios, prospectos, cercanía y ruta a Google Maps. Se entrega como un
**módulo activable** (`comercial`) montado sobre `clientes`, **on por defecto** en el vertical
`comerciales` ("Equipo comercial") y activable en cualquier otro vertical.

Fuente de requisitos: `criterios_crm_comercial_cliente.md` (RF-01…RF-25). Esta tanda cubre
**P0+P1 (RF-01…RF-19)**. P2/P3 (audio, calendar bidireccional, geofencing, IA, rutas
inteligentes) quedan fuera por decisión de alcance, coherente con el propio §16 del documento.

## Problema
El CRM base tiene clientes, auth, notas de texto libre y cola de notificaciones, pero **no**
tiene: coordenadas por cliente, mapa, estados de visita configurables, categoría ABC separada
del estado, modelo de visita, histórico de notas inmutable, recordatorios de usuario ligados a
cliente, prospectos, ni ruta de navegación. El comercial de campo no puede trabajar desde el
día uno.

## Alcance (P0+P1)
- **A. Modelo de datos (aditivo, sin DROP):** `Customer` gana `latitud/longitud`, `geo_estado`,
  `categoria_abc`, `estado_visita_id`, `tipo_registro`, `ultima_visita_en`, `proxima_accion_en`.
  Nuevos modelos: `VisitState` (estado de visita configurable), `Visit` (registro de visita),
  `CustomerNote` (nota inmutable), `Reminder` (recordatorio de usuario).
- **B. Back:** rutas `/visit-states`, `/visits`, `/customer-notes`, `/reminders`; extensión de
  `/customers` (nuevos campos, filtros estado/categoria/zona/tipo, `?near=lat,lng`, geocodificado
  al guardar tras `GeocoderPort`); import CSV/XLSX con detección de duplicados. Seed de 5 estados
  por negocio.
- **C. Front — módulo `comercial`:** vista mapa (Leaflet+OSM) con marcadores por estado + leyenda,
  ficha desde marcador, lista de "pendientes de geolocalizar", cambio de estado, badge ABC,
  filtros, histórico de notas, registro de visita, vista de pendientes, botón "Ir" (deep-link
  Google Maps), recordatorios, prospecto→cliente, cercanía, configuración de estados.
- **D. Activación/onboarding:** `ModuleId` `comercial`, entrada en `MODULES`, `ModuleGuard`,
  sidebar, y `comercial` añadido a `defaultModules` del vertical `comerciales` + terminología.

## Fuera de alcance (P2/P3, otros changes)
Transcripción de audio (RF-20), integración calendario (RF-21), avisos por proximidad/geofencing
(RF-22), backoffice completo (RF-23), rutas inteligentes (RF-24), IA de tareas desde notas (RF-25),
app nativa, ecommerce.

## Decisiones
- **Mapa desacoplado (RNF-10):** vista interactiva con **Leaflet + OpenStreetMap** (gratis, sin
  API key, sin facturación). Geocodificación tras `GeocoderPort` (impl. Nominatim por defecto;
  hueco para Google si se quiere más precisión). Ruta "Ir" = deep-link Google Maps
  (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`) — abre la app nativa de Google
  Maps en móvil en todos los casos.
- **Estado de visita ≠ categoría ABC (regla de negocio 4, §16.3):** el color/icono del marcador lo
  fija el **estado de visita**; la ABC es un **badge** secundario. Nunca se mezclan ni se pisan.
- **Notas inmutables (regla 6):** `CustomerNote` no tiene update ni soft-delete; el histórico no
  se sobrescribe.
- **Cliente sin coordenadas** no aparece en el mapa (regla 8); queda en lista de revisión con
  `geo_estado = PENDING/FAILED`.
- **Módulo aditivo:** los campos nuevos son nullable/defaulted → no afectan a verticales que no
  activen `comercial` (no regresión).

## Riesgos
- Geocodificación imprecisa con direcciones sucias (§16.2) → mitigado con coordenadas manuales y
  estado `FAILED` visible.
- Rate-limit de Nominatim (1 req/s) → geocodificar bajo demanda/al guardar, no en lote masivo sin
  throttle.
- Dependencia front nueva (`leaflet`) → aislada al módulo, carga dinámica (sin SSR).

## Rollback
Migración aditiva: revertible desactivando el módulo (`modules.comercial=false`) y, si procede,
`migrate` inverso que hace DROP de tablas/columnas nuevas (no toca datos existentes).

## Dependencias
- `clientes` (recomendado, no bloqueante).
- Prisma 7 + Supabase schema `crm`, patrón `@map` castellano.

## Criterios de éxito
- Todos los RF-01…RF-19 con criterio de aceptación verde (ver `validation.md`).
- back + front tests verde, `tsc` limpio.
- Verticales existentes sin regresión con el módulo desactivado.
