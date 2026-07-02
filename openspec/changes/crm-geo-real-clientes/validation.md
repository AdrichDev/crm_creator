# Validation: crm-geo-real-clientes

## User story

Como comercial de campo, quiero que cada cliente aparezca en el mapa en su dirección
real, para planificar rutas y visitas con datos fiables.

## Acceptance criteria

- AC1: Existe `POST /customers/geocode/rerun` (autenticado, gestor) que geocodifica
  con Nominatim los clientes `PENDING`/`FAILED` con dirección; con `force=true`
  también los `OK`. Devuelve `{ok, failed, skipped}`.
- AC2: El batch es secuencial con ≥1s entre peticiones a Nominatim y procesa como
  máximo un lote acotado por invocación.
- AC3: El front comercial ofrece la acción "Re-geolocalizar" que invoca el endpoint
  y refresca el mapa.
- AC4: Tras ejecutar el rerun (con aprobación humana), los clientes demo aparecen en
  sus coordenadas reales (muestra verificable: "Calle Alcalá, 20, Madrid" ≈
  40.417,-3.699 ± tolerancia) y no queda ningún `PENDING` con dirección sin intentar.

## Given-When-Then

Given 49 clientes PENDING con dirección y 20 OK con coordenadas sintéticas
When un gestor ejecuta "Re-geolocalizar" (y después un rerun con force aprobado)
Then los PENDING pasan a OK (coords reales de Nominatim) o FAILED (visibles en
pendientes RF-05), los sintéticos se corrigen a coordenadas reales, y el mapa
Leaflet los pinta en su ubicación verdadera.

## Test per task

| Tarea | Test |
|---|---|
| WU1 endpoint batch | e2e back (node:test) con geocoder inyectado de prueba (`setGeocoderForTests`): procesa PENDING/FAILED, respeta lote, force incluye OK, resumen correcto |
| WU2 acción front | test front: botón visible para gestor, invoca endpoint y refresca |
| WU3 datos corregidos | verificación SQL post-rerun: 0 PENDING con dirección; muestra de coords dentro de bounding box real de Madrid centro |

Un WU está DONE solo con su test en verde.
