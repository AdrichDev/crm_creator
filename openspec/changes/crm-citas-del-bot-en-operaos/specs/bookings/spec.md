# Delta spec — `GET /bookings` and `GET /bookings/stats`

Scope: the appointment endpoints of the CRM back (`back/src/routes/bookings.ts`). This
change adds a second, read-only source of rows: the bookings the business's assistant
took, which live in the agents schema (`aa.cita`) and are reached from the CRM process
through `$queryRaw`, anchored on `crm.negocio.tenant_id`.

## UC-1 — the panel lists bookings from both sources

**Given** a business whose `tenant_id` points at a tenant that owns at least one agent
**And** that agent holds bookings in `aa.cita`
**When** the panel calls `GET /bookings` for a date range
**Then** the response `items` contains both the CRM's own bookings and the agent's,
ordered by date and then time, and `total` is the sum of both counts.

AC:
- Agent rows carry `origen: "agente"`; CRM rows do not carry `origen`.
- Agent row ids are prefixed `aa:` so they can never collide with a `crm.reserva` id nor
  be mistaken for one by a later `PATCH`/`DELETE`.
- A business with no agent bookings keeps the previous behaviour exactly: pagination stays
  at the database level and no merge happens.

## UC-2 — the summary agrees with the calendar underneath it

**Given** a business with bookings from both sources
**When** the panel calls `GET /bookings/stats`
**Then** `total`, `confirmadas` and `pendientes` count both sources.

AC:
- `resumirCitas` is the single place where the two counts are added, so the route cannot
  drift from the listing.
- Agent statuses are compared against the castellano label already produced by
  `mapCitaAgente`, not against the CRM's `BookingStatus` enum.

## UC-3 — tenancy is anchored on the business, never on the request

**Given** a request carrying `x-business-id`
**When** the reader resolves which agent bookings to return
**Then** it reads `crm.negocio.tenant_id` for that business and filters `aa.agente` by it.

AC:
- The tenant id travels as a query parameter; it is never interpolated into the SQL.
- A business with `tenant_id = null` returns `[]` without issuing any query against
  `aa.cita`.
- Filtering by `employeeId` returns `[]`: the agents schema does not assign an employee to
  a booking, so any agent row would be a false positive.

## UC-4 — agent bookings are read-only in OperaOS

**Given** a booking with `origen === "agente"`
**When** it is rendered in the appointments panel
**Then** no edit or delete action is offered, and the row is labelled as the assistant's.

AC:
- The detail modal shows the note as text, with no textarea and no save action.
- Rationale: OperaOS cannot free the agent's `franja`, revoke the confirmation code or
  notify the customer, so a write from here would desynchronise the assistant's diary in
  silence.

## UC-5 — both sources are shown on the same clock

**Given** an agent booking stored in `aa.cita` for 21:00 Europe/Madrid
**When** the panel lists it in OperaOS
**Then** it reads 21:00, the same wall clock the customer agreed with the assistant.

AC:
- The two tables declare `timestamp without time zone` and store different things:
  `crm.reserva.inicia_en` holds the business's wall clock, while `aa.cita.inicio` holds a
  real UTC instant (agents-agency builds its slots with Luxon in the agent's zone and
  serialises them with an offset). The reader translates the agent's value into wall clock
  using `aa.horario_agente.zona_horaria`, defaulting to `Europe/Madrid`.
- The date range is compared against the translated value, not the raw instant: otherwise
  a booking in the first hours of the 1st falls outside its own month.
- Rationale: untranslated, a 21:00 dinner appeared at 19:00 — before the restaurant opened
  — which reads as corrupt data rather than as a display defect.

## Status mapping

| `aa.cita.estado` | CRM label |
|---|---|
| `scheduled` | Confirmada |
| `attended` | Completada |
| `cancelled` | Cancelada |
| `no-show` | Cancelada |
| anything else | Pendiente |

`cancelled` and `no-show` collapse into a single label because the CRM's own
`ESTADO_LABEL` already maps `NO_SHOW` to `Cancelada`; keeping them apart here would show
two different words for the same state depending on which source the row came from.

## Bounds

The reader caps at `AGENT_BOOKINGS_CAP = 2000` rows and logs a warning when the cap is
reached, so a truncated listing is never silent.
