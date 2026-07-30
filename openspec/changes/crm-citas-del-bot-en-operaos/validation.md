# Validation

## User story

As the owner of a business whose conversational agent takes bookings, I want those
bookings to appear in my OperaOS calendar, so that my diary reflects reality without my
having to look anywhere else.

## Acceptance criteria

- **AC1.** A booking taken by the business's agent appears in `GET /bookings` alongside
  the bookings created in the CRM, in the same row shape.
- **AC2.** Agent bookings carry `origen: "agente"`; CRM bookings do not carry the field.
- **AC3.** The panel shows no edit or delete action on an agent booking.
- **AC4.** A business never sees the bookings of another tenant.
- **AC5.** A business with no agent contracted (`tenant_id` null) gets the CRM bookings
  and nothing else, with no query issued against `aa.cita`.
- **AC6.** `GET /bookings/stats` totals include agent bookings.

## Scenarios

**AC1 — the agent's booking shows up**

- **Given** a business whose tenant has an agent with a booking on 2026-08-03 at 21:00
- **When** the owner opens the calendar for August
- **Then** that booking is listed, with its service name and party size

**AC4 — tenancy holds**

- **Given** two businesses, each with its own tenant and agent, each with one booking
- **When** the owner of the first requests `GET /bookings`
- **Then** only their own booking is returned

**AC5 — no agent, no query**

- **Given** a business with `tenant_id` null
- **When** `GET /bookings` runs
- **Then** the response contains only CRM bookings and `$queryRaw` was never called

## Test per task

All back-end tests live in a single file, `back/src/lib/__tests__/agent-bookings-mapping.test.ts`
(18 cases). The planned `bookings-merge.test.ts` was never created: the merge and the
summary were extracted as pure functions (`fusionarCitas`, `resumirCitas`), so they are
covered there instead of behind an HTTP harness. Names below point at what actually runs.

| Task | Test |
|---|---|
| A1 | `agent-bookings-mapping.test.ts` → «negocio sin tenant → [] sin consultar aa.cita» |
| A2 | `agent-bookings-mapping.test.ts` → «todos los estados… mapean» + «nombre cae a email y luego a literal» |
| B1 | `agent-bookings-mapping.test.ts` → `fusionarCitas`: mezcla en orden, pagina sobre el conjunto fusionado, ordena por hora |
| B2 | `agent-bookings-mapping.test.ts` → `resumirCitas`: el total suma ambas fuentes |
| B3 | `agent-bookings-mapping.test.ts` → «tenancy: el WHERE se ancla en el tenant del negocio» (id como parámetro, nunca interpolado) |
| C1 | `citas-origen-agente.spec.ts` → no actions on an agent row |
| D2 | Production count per business, recorded below |

## D2 — production data (read against the live Supabase, 2026-07-29)

11 businesses have a `tenant_id`. Agent bookings visible through the bridge:

| Business | Agent bookings | Of which in August 2026 |
|---|---|---|
| Brasserie Lafayette | 19 | 17 |
| Barbería Núñez | 12 | 9 |
| Estética Aurea | 12 | 8 |
| Casa Mendieta | 11 | 9 |

Casa Mendieta reports 10 confirmed out of 11, i.e. one cancelled booking, which is the
expected shape after the cancellation flow. A sample row as served by `GET /bookings`:

```json
{"id":"aa:cms7g8lhi000p4sfxcnp4xc5r","cliente":"Ana Serrano","servicio":"Comida",
 "fecha":"2026-07-31","hora":"11:30","estado":"Confirmada","aforo":2,"origen":"agente"}
```

That 11:30 lunch is the defect E1 fixes: Lafayette opens at 13:00, and the row was being
printed in UTC. Read against production after the fix, the same restaurant's 17 August
bookings all fall inside its hours — lunches at 13:45/14:00, dinners at 20:00/20:30 and
Sunday brunches at 11:30/12:00 against a Sunday opening of 11:30.

## Known gaps

- The e2e intercepts `GET /bookings`; it validates the panel's contract for an
  `origen: "agente"` row, not that production data reaches the browser. D2 covers the
  data path, C1 covers the rendering path; no single test covers both ends at once.
- ~~Seven pre-existing e2e specs log in as `owner@estudiolua.com`.~~ Closed by F1: all of
  them now go through `e2e/_auth.ts` and skip with a reason when `E2E_EMAIL` /
  `E2E_PASSWORD` are absent. Whether the credentials given have access to the seeded
  business is still the runner's responsibility — a wrong user makes the assertions fail,
  not skip.
- Three front unit files are red for reasons predating this change:
  `hover-tokens` (offender is `components/config/tenant-keys-panel.tsx`) and
  `sidebar-collapse` / `sidebar-user` (stale `vi.mock` of `@/lib/auth/session`, missing
  the `getCurrentUser` export).
