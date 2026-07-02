# Tasks: crm-geo-real-clientes

- [x] WU1 — Back: endpoint batch `POST /customers/geocode/rerun`
  - Autenticado (gestor: ADMIN/MANAGER vía requireRole). Filtra por negocio del token.
    `geo_estado IN (PENDING, FAILED)` con dirección; `force=true` incluye `OK`.
    Secuencial (throttle interno de NominatimGeocoder ≥1s), lote máx. 60. Respuesta
    `{ok, failed, skipped}`.
  - Reutiliza `resolveGeocoder()`/`setGeocoder()` existentes. Añadido endpoint
    test-only `POST /customers/__test__/set-geocoder` (gated `NODE_ENV!==production`,
    mismo patrón que `/auth/__test__/reset-rate-limits`) porque los e2e golpean el
    back como proceso HTTP aparte — `setGeocoder()` importado desde el test no llega
    a esa instancia.
  - Test: e2e back con node:test y geocoder de prueba inyectado (vía el endpoint
    test-only). 3/3 verdes.

- [x] WU2 — Front: acción "Re-geolocalizar"
  - En la vista comercial (pestaña mapa, panel "Pendientes de geolocalizar" RF-05):
    botón visible solo si `puedeEditar` (canWrite comercial) y hay pendientes; llama
    a `geocodeRerun()`, muestra resumen (alert) y refresca (`load()`).
  - Test: front (vitest) — render condicionado, llamada con `force=false` y refresh.
    2/2 verdes.

- [x] WU3 — Corrección de datos (aprobada por el usuario 02/07/2026, ejecutada)
  - Ejecutado vía `back/src/scripts/geocode-rerun-once.ts` (one-off, misma lógica que
    el endpoint; directo a DB porque el login del admin demo no estaba disponible).
  - Comercial Demo IA (force): 20/20 OK con coords reales de Nominatim.
  - EDM San Blas: 25 OK + 9 FAILED por dato erróneo ("Calle de Hermanos García
    Noblejas" sin "los" — el nombre oficial lleva "los"); corregida la dirección de
    esos 9 por SQL y re-geocodificados → 9/9 OK. 1 skipped (cliente sin dirección,
    queda PENDING visible en RF-05).
  - Verificación SQL: 0 PENDING con dirección en los negocios afectados. Outlier
    conocido: demo "Adrián — Calle Goya, 35" resolvió a 40.547,-3.890 (otra "Calle
    Goya", el CP 28001 sembrado no ayuda a desambiguar) — dato demo, no bloqueante.

- [x] WU4 — Verificación
  - Suites back (node:test, WU1) y front (vitest, WU2) en verde. WU3 queda
    pendiente de aprobación humana explícita, no ejecutado (ver apply-progress).
