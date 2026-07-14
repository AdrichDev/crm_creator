# Tasks — crm-calendar-tz-fix

Order matters: helpers → import → export → wiring → tests → verify.

- [x] T1. `lib/timezone.ts`: `instantToWallClockUtc` + `wallClockUtcToNaive`.
      Test: `timezone.test.ts` (AC3, summer/winter both directions). GREEN.
- [x] T2. `calendarSync.ts`: `parseEndpoint(ep, tz)`, `reconcileEvent(...,tz='UTC')`,
      `CalendarSyncDeps.getTimeZone`, `syncCredential` resolves tz, `buildProdDeps.getTimeZone`.
      Test: `calendarSync.test.ts` Madrid block (AC1) + existing pass with default `'UTC'` (AC4). GREEN.
- [x] T3. `calendar.ts`: `NewCalendarEvent.timeZone`, `BookingCalendarData.timeZone`,
      `toGoogleEventBody` naive+timeZone, `toNewCalendarEvent` forwards tz.
      Test: `calendar.test.ts` body assertion (AC2). GREEN.
- [x] T4. `bookings.ts`: select `zonaHoraria`, pass `timeZone` into `createBookingCalendarEvent`.
- [x] T5. Verify: `tsc --noEmit` clean (exit 0) + 60 unit tests (tz/sync/calendar) + 15 bookings unit GREEN.
      e2e (`*.e2e`) NO ejecutados: requieren server:4001 + Supabase, flaky en paralelo (infra).

## Final verifications
- `npx tsc --noEmit` (back) clean.
- `node --import tsx --test` on the 3 test files green.
- Manual (post-deploy, HITL): re-sync a real Madrid event → agenda shows correct hour.

## Out-of-code follow-ups (documented, not in this change)
- Delete existing wrong "Google Calendar" imported bookings before prod re-sync (dup risk).
- n8n `crm-calendar-push` workflow: verify its Google node timezone config for the staff path.
