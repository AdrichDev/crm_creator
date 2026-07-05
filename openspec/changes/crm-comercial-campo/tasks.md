# Tareas — crm-comercial-campo

Alcance: **P0+P1 (RF-01…RF-19)**. Mapa Leaflet+OSM, geocoder desacoplado, "Ir" deep-link Google.
Orden = por dependencia (modelo → back → activación → front). Agentic Runtime gate antes de cualquier push.

## WU1 — Modelo de datos + migración (back/DB) ✅ HECHO (tsc + test 5/5 verde)
- [x] 1.1 Enums + campos aditivos en `Customer`.
- [x] 1.2 Modelos `VisitState`, `Visit`, `CustomerNote` (inmutable), `Reminder`.
- [x] 1.3 Migración `20260701030000_comercial_campo/migration.sql` aditiva + RLS. ⚠️ PENDIENTE APLICAR por usuario.
- [x] 1.4 Seed 5 estados `esSistema` + backfill (`scripts/backfill-comercial.ts`) + wiring en alta de negocio (projects.ts, misma tx).
- [x] 1.5 Test `visit-states.test.ts` (5 invariantes).

## WU2 — Back rutas/servicios ✅ HECHO (tsc + back suite 137/0 verde)
- [x] 2.1 `GeocoderPort` + Nominatim (throttle, User-Agent) + `resolveGeocoder()`. Test mock 8.
- [x] 2.2 Routers `/visit-states`, `/visits` (tx), `/customer-notes` (sin PATCH/DELETE), `/reminders`. Registrados.
- [x] 2.3 `/customers` extendido: campos nuevos, geocode al guardar, filtros estado/categoria/tipo/zona, `?near`.
- [x] 2.4 `/customers/import` + dedupe (últimos 9 díg. tel / nombre+dirección). Test 4.
- [x] 2.5 `/customers/:id/convert` prospecto→cliente.
- [x] 2.6 Tests geocoder/haversine/import verdes (17 total nuevos).

## WU3 — Módulo `comercial` + activación (front config) ✅ HECHO (tsc front limpio)
- [x] 3.1 `ModuleId += 'comercial'` + entrada en `MODULES` (front + shared) (icon MapPinned, href `/comercial`).
- [x] 3.2 `verticals.comerciales.defaultModules += 'comercial'` + terminología (`comercial: 'Ruta comercial'`).
- [x] 3.3 Emoji (icons.ts), roles (trabajador ve comercial). `deserialize` mergea el módulo nuevo a false.
- [x] 3.4 Test front unit de config (`tests/comercial-activacion.test.ts`, 4/4 verde).

## WU4 — Mapa + marcadores + estados visuales (RF-04/05/07/10) ✅ HECHO
- [x] 4.1 `mapa-clientes.tsx` Leaflet dynamic (ssr:false), markers por `estadoVisita.color`, leyenda (en page).
- [x] 4.2 Solo `geoEstado=OK` en mapa; lista "pendientes de geolocalizar" (page).
- [x] 4.3 Click marcador → `ficha-cliente-panel` (datos, estado, ABC, notas, visitas, recordatorios).

## WU5 — Estado visita + ABC + filtros (RF-06/08/09/14) ✅ HECHO
- [x] 5.1 Cambio de estado desde ficha (PATCH, refresca manteniendo selección).
- [x] 5.2 `abc-badge` (color por tono) separado de `estado-visita-badge` (color propio del estado).
- [x] 5.3 Filtros estado/categoría/tipo/zona en la page (back aplica where).

## WU6 — Notas + visitas (RF-11/12) ✅ HECHO
- [x] 6.1 Nota inline + histórico cronológico inmutable (fecha/hora/origen) en la ficha.
- [x] 6.2 Registro de visita (resultado, nota, próxima acción, estado posterior) en la ficha.

## WU7 — Pendientes + ruta + recordatorios (RF-13/15/16) ✅ HECHO
- [x] 7.1 Pestaña Pendientes (estados `esPendiente`).
- [x] 7.2 `maps-link` deep-link Google Maps; botón "Ir" bloqueado+aviso sin coords. Test verde.
- [x] 7.3 Recordatorios en ficha (crear/completar, vencido resaltado).

## WU8 — Prospectos + cercanía + estados configurables (RF-17/18/19) ✅ HECHO
- [x] 8.1 Alta prospecto (EntityModal, tipoRegistro=PROSPECTO) + convertir (botón en ficha → `/convert`).
- [x] 8.2 "Cerca de mí" (navigator.geolocation → `?near`; degradación si se niega).
- [x] 8.3 `config-estados` admin (CRUD VisitState, sistema no borrable).

## WU9 — Import CSV (RF-03) ✅ HECHO
- [x] 9.1 `import-clientes-modal`: subir CSV, previsualizar, importar; avisa duplicados + forzar.
- [x] 9.2 `csv.ts` parser puro + test 4. (XLSX = extensión futura con parser aparte.)

## Cierre
- [x] Z.1 back 137/0 · front 284/0 · tsc back+front limpio (+28 tests nuevos: back 17, front 11).
- [x] Z.2 Agentic Runtime review HECHO (5 hallazgos). Aplicados 3: import geocode (🔴), Leaflet cleanup en
  unmount (🟡), try/catch en mutaciones de la ficha (🟡). Skip justificado 2 (filtros
  estadoVisitaId/customerId ya scoped por businessId → sin fuga cross-tenant). Commit bf40a8b
  en rama ac/comercial-campo-geolocalizado (NO pusheado).
- [x] Z.3 ARQUITECTURA.md catálogo actualizado. Engram persistido.
- [x] Z.4 Migración APLICADA a Supabase (migrate deploy) + backfill 38 negocios (190 estados).
  Verificado: 4 tablas + 6 columnas cliente + estados sembrados. Schema up to date, sin drift.
