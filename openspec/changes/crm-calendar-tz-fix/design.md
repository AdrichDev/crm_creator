# Design — crm-calendar-tz-fix

## Approach
Single conversion boundary. The CRM's internal convention (wall-clock-as-UTC) stays
untouched — every display/availability path keeps reading `getUTC*`. We convert ONLY where
data crosses the Google boundary, using the business timezone.

## Helpers (`lib/timezone.ts`)
- `instantToWallClockUtc(instant: Date, timeZone: string): Date`
  Real instant → Date whose UTC fields are the wall-clock of that instant in `timeZone`.
  Impl: `Intl.DateTimeFormat(timeZone, hourCycle:'h23', all numeric parts).formatToParts`,
  rebuild `new Date('YYYY-MM-DDTHH:mm:ss.000Z')`. DST handled per-instant by Intl.
- `wallClockUtcToNaive(d: Date): string`
  Wall-clock-as-UTC Date → RFC3339 without offset: `d.toISOString().slice(0,19)`.

## Import (`calendarSync.ts`)
- `parseEndpoint(ep, timeZone)`: `instantToWallClockUtc(new Date(ep.dateTime), timeZone)`.
- `reconcileEvent(businessId, token, event, deps, timeZone)`: new required `timeZone` param
  (TZ-sensitive fn → explicit at every call site), threaded to the 4 `parseEndpoint` calls.
- `CalendarSyncDeps.getTimeZone(businessId): Promise<string>`: resolves
  `Location.zonaHoraria` (first active location) ?? `'Europe/Madrid'`.
- `syncCredential`: resolves `timeZone` once per credential, passes to `reconcileEvent`.

## Export (`calendar.ts`)
- `NewCalendarEvent.timeZone?: string`; `BookingCalendarData.timeZone?: string`.
- `toGoogleEventBody`: `tz = event.timeZone ?? 'Europe/Madrid'`;
  `start/end = { dateTime: wallClockUtcToNaive(...), timeZone: tz }`.
- `toNewCalendarEvent`: forwards `data.timeZone`.

## Wiring (`bookings.ts`)
- Confirmation push (line ~294): add `zonaHoraria` to the `location` select, pass
  `timeZone: bizLocation?.zonaHoraria` into `createBookingCalendarEvent`.

## Test strategy
- `timezone.test.ts`: summer/winter conversions both directions.
- `calendarSync.test.ts`: existing direct `reconcileEvent` calls pass `'UTC'` (no shift →
  assertions unchanged); new block asserts Madrid offset conversion; `makeDeps` gains
  `getTimeZone`.
- `calendar.test.ts`: update `start.dateTime` assertion to naive + assert `timeZone`.
- Runner: `node --import tsx --test` (back convention, not vitest).

## Data flow
Google `+02:00` → `new Date` (instant) → `instantToWallClockUtc(tz)` → `startAt` (wall-UTC)
→ agenda `getUTCHours` → correct. Inverse for export.
