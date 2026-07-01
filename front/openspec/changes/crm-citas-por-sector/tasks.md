# Tasks: Citas por sector

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950 (schema+migración 40, router 80, catálogo 60, 3 modales custom ~180 c/u = 540, citas/page.tsx 90, tests 140) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | WU1 Schema+router → WU2 Catálogo+citas/page.tsx → WU3 Modal entrenamiento → WU4 Modal clase → WU5 Modal reunión |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Sí — el usuario debe aprobar explícitamente la
migración (`Booking.teamId`) antes de aplicarla (regla del proyecto), y
confirmar el orden de construcción de los 3 modales (¿los 3 a la vez o uno
primero como piloto?).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU1 | Schema (`teamId`) + router XOR + tests back | PR 1 | Migración BLOQUEADA hasta aprobación |
| WU2 | Catálogo `citas-sector-fields.ts` + `citas/page.tsx` (columnas dinámicas, sin romper el resto) | PR 2 | Depende de WU1 solo para el tipo, no para la migración en sí |
| WU3 | `nueva-entrenamiento-modal.tsx` (centro-deportivo) | PR 3 | Depende de WU1+WU2 — PILOTO recomendado, validar antes de WU4/WU5 |
| WU4 | `nueva-clase-modal.tsx` (fitness) | PR 4 | Depende de WU3 (reutiliza helpers extraídos ahí) |
| WU5 | Canal en `nueva-cita-modal.tsx` (comerciales) | PR 5 | El más pequeño, independiente de WU3/WU4 |

---

## Phase 1: Schema y backend (WU1)

- [x] 1.1 `back/prisma/schema.prisma`: `Booking.teamId String? @map("equipo_id")` + `team Team? @relation(fields:[teamId],references:[id])`; relación inversa `bookings: Booking[]` en `Team`
- [x] ⚠️ 1.2 **[BLOQUEADA — requiere aprobación humana]** Aplicar migración vía Supabase MCP: `ALTER TABLE crm.reserva ADD COLUMN equipo_id TEXT` + FK constraint
- [x] 1.3 `prisma generate` + `prisma migrate resolve --applied` (recipe ya usada en el repo, ver memoria `crm-prisma-migration-gotcha`)
- [x] 1.4 Router de bookings: validación XOR `customerId`/`teamId` (0 o 2 → 400 `XOR_REQUIRED`), aceptar `resourceIds: string[]` en create/update
- [x] 1.5 Tests back: XOR (spec C-S4, C-S5), crear booking con `teamId`+`resourceIds` y leer de vuelta con include

## Phase 2: Catálogo y página Citas (WU2 — depende Phase 1 solo por tipos)

- [x] 2.1 `front/lib/config/citas-sector-fields.ts` (nuevo): `SectorFieldsDef`, `CITAS_SECTOR_FIELDS` con las 3 entradas representativas
- [x] 2.2 `front/app/(crm)/citas/page.tsx`: `Table head` dinámico desde `CITAS_SECTOR_FIELDS[vertical]?.columns ?? [...actual]`; `onNueva()` decide el modal por `formComponent`
- [x] 2.3 Test front: resolución de catálogo para los 3 representativos + verificación de que los 8 no representativos devuelven `undefined` (caen al genérico) — spec C-S1, C-S8

## Phase 3: Modal Entrenamiento — piloto (WU3 — depende Phase 1+2)

- [x] 3.1 `front/components/crm/nueva-entrenamiento-modal.tsx` (nuevo): selectores equipo (`GET /categories`), campo (`GET /resources?tipo=COURT`), entrenador (`GET /employees`), día semana + hora inicio/fin
- [x] 3.2 Helper compartido (extraer para reuso en WU4): "día semana + hora" → `startAt`/`endAt` concretos (próxima ocurrencia de ese día)
- [x] 3.3 Submit → `POST /bookings` con `teamId`, `resourceIds: [campoId]`, `employeeId`, sin `customerId` (spec C-S3)
- [x] 3.4 Test render: sin campo "Cliente" visible; con equipo/campo/entrenador (spec C-S3)

## Phase 4: Modal Clase (WU4 — depende Phase 3 por el helper de día+hora)

- [x] 4.1 `front/components/crm/nueva-clase-modal.tsx` (nuevo): clase (`Service`), instructor (`Employee`), sala (`Resource` tipo `ROOM`/`SPACE`), aforo informativo, día+hora (reusa helper de 3.2)
- [x] 4.2 Submit sin `customerId` ni `teamId` (spec C-S6)
- [x] 4.3 Test render: aforo se muestra, no bloquea envío

## Phase 5: Canal en Reunión (WU5 — independiente)

- [x] 5.1 `front/components/crm/nueva-cita-modal.tsx`: campo `canal` (select) visible solo si `vertical === 'comerciales'`
- [x] 5.2 Columna "Canal" en tabla cuando aplica (spec C-S7)

## Phase 6: Verification (Z)

- [x] 6.1 `npx tsc --noEmit` en `front/` — 0 errores
- [x] 6.2 `npm test` en `back/` — XOR + integración, todo verde
- [x] 6.3 Suite completa `front/` (vitest) — 0 regresiones en los tests ya existentes de Citas/Agenda
- [x] 6.4 Comprobación visual real (Playwright) contra EDM San Blas (`centro-deportivo` real, con equipos reales) — confirmado: sidebar "Entrenamientos"/"Categorías"/"Cuotas y abonos", tabla con columnas Equipo/Campo/Día/Hora/Entrenador/Estado (sin "Cliente"), modal "Nuevo entrenamiento" con los 6 campos exactos de la spec. Hallazgo de datos (no de código): el negocio no tiene ningún `Servicio` creado, por lo que "Actividad" sale vacío — hace falta 1 servicio para poder crear un entrenamiento real. `fitness`/`comerciales` siguen sin verificar en vivo (sin tenant de esos verticales disponible).
