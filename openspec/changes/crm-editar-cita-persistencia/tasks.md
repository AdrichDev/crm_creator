# Tasks: crm-editar-cita-persistencia

- [x] WU0 — Back: convención única wall-clock en horas de reserva (FIX PRINCIPAL)
  - `lib/availability.ts`: nuevo `parseWallClock()` — un `start` string sin
    designador de TZ se interpreta como UTC (antes: hora local del proceso vía
    `new Date(str)`); `minutesOfDay`/`diaSemana` pasaron a `getUTCHours/getUTCMinutes/
    getUTCDay`; `dateOnly` a `getUTCFullYear/getUTCMonth/getUTCDate`; `iterateDaySlots`
    dejó de usar `setHours/setMinutes` (locales) y construye el instante por aritmética
    de epoch (`day.getTime() + m*60000`); `daySlotsWithAvailability` pasó a
    `getUTCHours/getUTCMinutes` para el `hora:` de los chips. `routes/bookings.ts` no
    necesitó cambios propios (ya delega en `checkAvailability`). Revisados ICS
    (`lib/ics.ts`, ya usa `formatDateUTC`) y push a Google Calendar
    (`lib/calendarEmitter.ts`, ya usa `toISOString()`) — ambos ya eran UTC-safe, sin
    cambios. `dashboard.ts`/`reminders.ts` (boundary "hoy") y `timeoff.ts` (campos
    `inicio`/`fin` son date-only, sin ambigüedad de TZ) quedan fuera — no forman parte
    del pipeline de horas de reserva.
  - La hora introducida = hora guardada = hora mostrada, sea cual sea la TZ del server.
  - Test: `back/src/routes/__tests__/bookings-timezone.e2e.test.ts` (nuevo) — AC0 contra
    el back ya arrancado (siempre corre) y AC0 repetido contra una instancia AISLADA del
    back arrancada en el propio test con `TZ=America/New_York` forzada (prueba real de
    independencia de TZ, no solo teórica). El segundo test es OPT-IN
    (`RUN_TZ_FORCED_E2E=1`): arrancar un server completo abre su propio pool de conexiones
    Prisma y, corriendo en paralelo con el resto de la suite (75 ficheros, cada uno con su
    propio pool), agotaba el pooler de Supabase (`EMAXCONNSESSION`) y tumbaba tests de
    OTROS ficheros por colateral — verificado empíricamente (26 fallos vs. 21 basales) y
    corregido con el gate opt-in + `DB_POOL_MAX=2` en el hijo. 2/2 verdes con
    `RUN_TZ_FORCED_E2E=1`; 1 pass + 1 skip limpio en el modo por defecto (sin abrir ningún
    proceso extra). Además corregidos dos ficheros de test preexistentes que sembraban
    `booking.startAt` con `new Date(\`${date}T10:00:00\`)` (sin `Z`, ahora interpretado
    distinto) — `bookings-slots.e2e.test.ts` y mi propio `bookings-patch.e2e.test.ts` —
    añadido el sufijo `Z` para alinear con la nueva convención. Sin esa corrección, 3 tests
    preexistentes fallaban (falso negativo del fix, no regresión del fix en sí).

- [x] WU1 — Back: `PATCH /bookings/:id` ampliado
  - Aceptar `status` (enum BookingStatus, 422 si inválido; registrar en
    `historial_estado_reserva` como las transiciones existentes) y `serviceId`
    (revalidar disponibilidad si cambia).
  - Operación atómica: conflicto de disponibilidad → 409 y nada persiste.
  - Test: e2e back con node:test (no vitest).

- [x] WU2 — Front: payload completo en edición
  - `app/(crm)/citas/page.tsx` `onSubmit`: enviar `start`, `employeeId`, `serviceId`,
    `status` (mapeo etiqueta ES ↔ enum), `notes`.
  - Test: `tests/citas-page-edicion.test.tsx` ampliado.

- [x] WU3 — Verificación
  - Suites back y front en verde (WU0/WU1/WU2, ver detalle de cada WU arriba).
    typecheck back limpio. Sin commit/push.
