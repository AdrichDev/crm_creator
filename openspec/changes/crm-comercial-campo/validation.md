# Validación — crm-comercial-campo

Historia: como **comercial de campo** quiero ver mis clientes en un mapa, saber a quién he
visitado y quién falta, dejar notas y visitas, priorizar por ABC, crear recordatorios y abrir la
ruta a cada cliente, para gestionar mejor mis visitas desde el móvil.

## Criterios de aceptación (AC)
- **AC1 (RF-04/05/07):** clientes con coordenadas válidas se muestran en el mapa, con color/icono
  según su estado de visita; los sin coordenadas NO aparecen y quedan en lista de revisión.
- **AC2 (RF-08/09, regla 4):** cambiar la categoría ABC no altera el estado de visita, y viceversa;
  el color del marcador depende solo del estado, la ABC es un badge.
- **AC3 (RF-11, regla 6):** las notas se guardan con fecha/hora/autor, en orden cronológico, y no
  se pueden editar ni borrar (sin endpoint PATCH/DELETE).
- **AC4 (RF-12):** registrar una visita guarda fecha/resultado/nota/próxima acción, actualiza
  `ultimaVisitaEn` y, si procede, el estado de visita del cliente.
- **AC5 (RF-13):** existe una vista que muestra solo clientes pendientes/seguimiento/revisitar.
- **AC6 (RF-15, §10.6):** con coordenadas válidas, "Ir" abre Google Maps con destino cargado; sin
  coordenadas, la acción se bloquea con aviso.
- **AC7 (RF-16):** un recordatorio aparece en la ficha del cliente y en la vista de próximos;
  vencido = PENDING con fecha pasada.
- **AC8 (RF-17):** un prospecto se crea, se ubica y, al convertirlo en cliente, conserva notas y
  visitas.
- **AC9 (RF-18):** con ubicación del usuario, se puede ordenar/filtrar por cercanía.
- **AC10 (RF-19):** el admin puede definir estados (nombre/color/icono/orden/pendiente); la leyenda
  refleja lo configurado.
- **AC11 (RF-03):** import CSV/XLSX crea clientes y avisa de posibles duplicados por
  nombre/teléfono/dirección.
- **AC12 (no regresión):** con el módulo `comercial` desactivado, los demás verticales funcionan
  igual; back+front tests verde, `tsc` limpio.

## Por tarea (Given-When-Then + test)
- **WU1.1** Customer campos aditivos → Given migración aplicada, When `prisma migrate status`,
  Then sin drift y columnas nuevas nullable. Test: `back` schema test + `migrate status`.
- **WU1.2** Notas inmutables → Given `CustomerNote`, When se inspecciona el router, Then no hay
  PATCH/DELETE. Test: node:test `customer-notes.immutable.test.ts`.
- **WU1.3** Seed estados → Given negocio nuevo, When seed/backfill, Then existen 5 `VisitState`
  `esSistema`. Test: node:test seed.
- **WU2.1** Geocoder → Given dirección válida (fetch mockeado), When POST customer, Then lat/lng y
  `geoEstado=OK`; dirección inválida → `FAILED`. Test: `geocoder.test.ts`.
- **WU2.2** Proximity → Given 3 clientes con coords, When GET `/customers?near=lat,lng`, Then orden
  por distancia asc. Test: `customers.near.test.ts`.
- **WU2.3** Visita tx → Given cliente, When POST `/visits` con estadoPosterior, Then
  `ultimaVisitaEn` y `estadoVisitaId` actualizados. Test: `visits.test.ts`.
- **WU2.4** Import dedupe → Given CSV con fila que coincide en nombre+teléfono, When POST import,
  Then se reporta conflicto y no se duplica salvo forzar. Test: `import.dedupe.test.ts`.
- **WU2.5** Convert → Given prospecto con nota+visita, When POST `/customers/:id/convert`, Then
  `tipoRegistro=CLIENTE` y historial intacto. Test: `convert.test.ts`.
- **WU3** Activación → Given config sin `comercial`, When `deserialize`, Then `modules.comercial`
  existe en false; vertical `comerciales` lo trae en true. Test: front unit `tenant-config`.
- **WU4** Mapa/color → Given clientes con estado, When render mapa, Then marcador con color del
  estado y leyenda; sin coords → no marcador, sí lista revisión. Test: unit render + e2e si aplica.
- **WU5** Estado≠ABC → Given cambio de ABC, When guardar, Then estado de visita intacto (y vice).
  Test: unit `badge` + e2e.
- **WU6** Notas/visitas UI → Given ficha, When añadir nota, Then aparece arriba con fecha/autor,
  sin sobrescribir. Test: unit + e2e.
- **WU7** "Ir"/pendientes/recordatorios → Given cliente sin coords, When pulsar Ir, Then bloqueo +
  aviso. Test: unit `maps-link.test.ts`.
- **WU8** Cercanía/estados config → Given estados editados, When abrir mapa, Then leyenda refleja.
  Test: e2e/unit.
- **WU9** Import UI → Given fichero, When subir, Then previsualiza + marca duplicados. Test: e2e.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-07-01)
IMPLEMENTADO WU1-WU9. back 137/0 · front 284/0 · tsc back+front limpio. 28 tests nuevos
(back: geocoder 8, import 4, visit-states 5; front: maps-link 3, activación 4, csv 4).
PENDIENTE: (1) aplicar migración a Supabase + backfill para verificación e2e con dato real;
(2) Ruflo review antes de push; (3) e2e Playwright del mapa (opcional, requiere DB aplicada).
