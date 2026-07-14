# Proposal — crm-calendar-tz-fix

## Intent
Fix the timezone mismatch at the Google Calendar boundary. The CRM stores/display all
booking times as **wall-clock-as-UTC** (`availability.ts`: hours read via `getUTC*`,
written as no-TZ parsed-as-UTC). Google Calendar speaks **real instants with offset**.
No code converts between the two, so:

- **Import (Google → CRM):** `calendarSync.ts` `parseEndpoint` does `new Date(ep.dateTime)`.
  A 10:00 Madrid event (`...T10:00:00+02:00`) becomes instant `08:00Z`, stored `08:00Z`,
  and the agenda (getUTCHours) shows **08:00** — off by the Madrid offset.
- **Export (CRM → Google, OAuth path):** `calendar.ts` `toGoogleEventBody` sends
  `start.toISOString()`. A 10:00 booking (`10:00Z` wall-clock) is sent as 10:00 UTC →
  Google shows **12:00**.

## Scope
IN:
- `lib/timezone.ts` (new): `instantToWallClockUtc` + `wallClockUtcToNaive` (Intl, no lib, DST-correct).
- Import conversion in `calendarSync.ts` (`parseEndpoint` + new `getTimeZone` dep).
- Export conversion in `calendar.ts` (`toGoogleEventBody` → naive local + `timeZone`).
- Thread `Location.zonaHoraria` (default `Europe/Madrid`) through `bookings.ts` create push.
- Tests: `timezone.test.ts` (new), `calendarSync.test.ts`, `calendar.test.ts`.

OUT (flagged, not silently changed):
- **n8n staff-push path** (`calendarEmitter.ts` → `calendar.event_push`): sends the same
  `.toISOString()`, but its timezone is resolved by the n8n workflow (outside this repo).
  Changing its payload risks breaking the live workflow → left as a documented follow-up.
- **Data migration**: bookings already imported are stored with the wrong offset. After the
  fix a re-sync recomputes them correctly, but `findImportedBooking` matches by exact
  `startAt` → it would DUPLICATE instead of updating. The existing wrong "Google Calendar"
  bookings must be deleted before re-syncing (manual, HITL) — not part of this code change.

## Risks
- Wrong TZ helper → every synced/pushed time shifts. Mitigated by DST unit tests (summer +2 / winter +1).
- Breaking existing test contracts (`start.dateTime` shape). Handled by updating assertions.

## Dependencies
`Location.zonaHoraria` (schema:274, default `Europe/Madrid`) — currently dormant, now the TZ source.
