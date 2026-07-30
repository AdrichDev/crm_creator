# Bookings taken by the agent must appear in OperaOS

## Intent

A booking made by a tenant's conversational agent is invisible to that tenant. The agent
writes to `aa.cita`, OperaOS reads `crm.reserva`, and nothing connects the two. A
restaurant whose bot took eighteen reservations sees an empty diary.

Appointments are operational data and belong in the tenant's panel. OperaOS is where they
have to show up.

## Scope

- `GET /bookings` also returns the bookings taken by the business's agent, in the same
  castellano row shape the front already consumes.
- `GET /bookings/stats` counts them, so the header totals stop contradicting the calendar.
- Agent bookings are marked with an origin and are **read-only** in OperaOS.

## Out of scope

- Writing to `aa.cita` from OperaOS. Editing or cancelling an agent booking from the CRM
  is a separate change: the availability engine, the slot table and the confirmation
  codes live in the agents schema, and a half-write would corrupt them.
- Moving the booking engine into the CRM, or mirroring rows between schemas.

## Approach

OperaOS reads `aa.cita` directly, the same way it already reads seven other tables of the
agents schema through `$queryRaw`. No duplication, no synchronisation, nothing to drift:
there stays exactly one row per booking, owned by the schema that created it.

## Risks

- **Cross-schema coupling.** Already present and deliberate: both products share one
  database, and the CRM reads `aa.tenant`, `aa.agente`, `aa.recurso`, `aa.servicio_agente`,
  `aa.servicio_recurso`, `aa.horario_agente` and `aa.uso_tokens` today.
- **Tenancy.** The join has to be anchored on the active business's `tenant_id`. Anchoring
  it anywhere else would leak another tenant's diary. Covered by a test.
- **Pagination over two sources.** Merging in memory changes the cost profile of the
  listing; bounded by a hard cap and by the date range the calendar already sends.

## Dependencies

`crm.negocio.tenant_id` → `aa.tenant.id` → `aa.agente.tenant_id` → `aa.servicio_agente.agente_id`
→ `aa.cita.servicio_id`. All of it exists; nothing new is created.
