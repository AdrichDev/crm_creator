# Design

## Why read instead of mirror

Three options were on the table.

| Option | Verdict |
|---|---|
| OperaOS reads `aa.cita` | **Chosen.** One row, one owner, nothing to drift. Reversible: delete the reader and the CRM is exactly as it was. |
| Mirror `aa.cita` → `crm.reserva` on write | Rejected. Two rows for one booking. The moment anyone edits the copy, the two disagree and neither is authoritative. |
| The agent writes into `crm.reserva` | Rejected for now. Availability, slots, buffers, party-size fitting and confirmation codes all live in the agents schema. Moving the write without moving the engine means reimplementing all of it. |

## Where the code goes

`back/src/lib/bookings/agent-bookings.ts` — one module, one exported function:

```ts
listAgentBookings({ businessId, from, to, status }): Promise<CitaRow[]>
```

It resolves the business's `tenant_id`, then reads `aa.cita` joined to
`aa.servicio_agente` and `aa.agente`, and maps each row into the same castellano shape
`GET /bookings` already emits. Route code stays thin.

## Tenancy anchor

The `WHERE` is anchored on `a.tenant_id = <the active business's tenant_id>`, resolved
from `crm.negocio` inside the same function — never taken from the request. A business
with `tenant_id = NULL` (no agent contracted) gets an empty list without touching
`aa.cita`.

## Row shape

Agent bookings reuse the existing field names so the front needs no new rendering path:

| Field | Source |
|---|---|
| `id` | `cita.id`, prefixed `aa:` so it can never collide with a `crm.reserva` id |
| `cliente` / `clienteComercial` | `cita.nombre_cliente` → `cita.email` → `"Cliente del bot"` |
| `servicio` | `servicio_agente.nombre` |
| `empleado` | `""` — the agents schema has no employee on a booking |
| `fecha` / `hora` | `cita.inicio` |
| `estado` | `scheduled`→Confirmada, `attended`→Completada, `cancelled`/`no-show`→Cancelada |
| `aforo` | `cita.comensales` |
| `notes` | `cita.notas` |
| `origen` | `"agente"` — new field, absent on CRM rows |

## Read-only in the panel

`origen: "agente"` drives it. The front hides edit and delete on those rows: OperaOS has
no way to release the slot, revoke the confirmation code or notify the customer, so an
edit here would silently desynchronise the agent's diary. The row is shown, not touched.

## Merge and pagination

The calendar sends a date range and `limit=100`. Both sources are read for that range,
merged, sorted by start, and sliced for the requested page; `total` is the sum. A hard cap
of 2000 rows per source bounds the in-memory merge — logged when hit, never silently
truncated.

## Test strategy

- Unit: the mapping (every status, missing name, missing notes).
- Tenancy: a business whose tenant has an agent does not see another tenant's bookings.
- Null tenant: a business with no agent gets `[]` and issues no query against `aa.cita`.
- Route: `GET /bookings` returns both origins, sorted, with the summed total.
