# Validation — crm-calendar-tz-fix

## User story
Como negocio con Calendar conectado, quiero que las citas se muestren en la agenda del CRM
y en mi Google Calendar a la MISMA hora que las creé, sin desfase de zona horaria.

## Acceptance criteria
- AC1: Un evento de Google a las 10:00 Madrid (`...T10:00:00+02:00`) importado al CRM se
  guarda como `10:00Z` (wall-clock-as-UTC) y la agenda muestra **10:00**.
- AC2: Una cita del CRM a las 10:00 (`10:00Z`) empujada al Calendar del negocio (OAuth) llega
  como 10:00 Madrid (dateTime naive `2026-...T10:00:00` + `timeZone: Europe/Madrid`).
- AC3: La conversión es correcta en horario de verano (+02:00) y de invierno (+01:00).
- AC4: Los caminos soft-fail (token revocado, negocio sin ubicación, evento roto) siguen
  sin lanzar (sin regresión sobre los tests existentes de `calendarSync`).

## Scenarios (Given-When-Then) + test per task
1. Given un evento Google `2026-07-10T11:00:00+02:00`, When `reconcileEvent(..., 'Europe/Madrid')`,
   Then la reserva se crea/actualiza con `startAt = 2026-07-10T11:00:00.000Z`.
   → test: `calendarSync.test.ts` describe "conversión de zona horaria".
2. Given una cita `start = 2026-07-10T09:00:00Z` con `timeZone Europe/Madrid`, When `createCalendarEvent`,
   Then el body enviado tiene `start.dateTime = '2026-07-10T09:00:00'` y `start.timeZone = 'Europe/Madrid'`.
   → test: `calendar.test.ts` "POST con dateTime naive + timeZone".
3. Given instante `2026-01-10T09:00:00Z` (invierno) y tz Europe/Madrid (+01:00),
   When `instantToWallClockUtc`, Then devuelve `2026-01-10T10:00:00.000Z`.
   → test: `timezone.test.ts` "DST invierno vs verano".
