# Dashboard "Histórico" Specification

## Purpose

Give the operator a "Histórico" tab inside the generator dashboard embedding
project lifecycle control and state-event audit history, reusing the existing
operator lifecycle surfaces (`lifecycle-control.tsx`, `operator.ts`,
`TenantStateEvent`) without duplicating logic or leaving the dashboard.

## Requirements

### Requirement: Tab Placement

The system MUST add a "Histórico" `Tab` in `dashboard-tabs.tsx` positioned
between the "Generados" and "Exportar" tabs.

#### Scenario: Tab order

- GIVEN the dashboard tab bar
- WHEN it renders
- THEN the order is Proyecto → Generados → Histórico → Exportar

### Requirement: Project Selector

The Histórico tab MUST provide a project selector (by `businessId`) that
determines which project's lifecycle control and event history are displayed
below it.

#### Scenario: Selecting a project loads its data

- GIVEN two projects with distinct lifecycle histories
- WHEN the operator selects project B in the selector
- THEN the lifecycle control and event table below update to reflect project B

### Requirement: Embedded Lifecycle Control Without Frontend Gate

The system MUST embed the lifecycle sub-view (switch + selector as implemented
in `front/app/(operador)/negocios/[id]/lifecycle-control.tsx`, imported
directly) calling `setBusinessLifecycle` and `fetchBusinessStateEvents`
(`front/lib/api/operator.ts`). The system MUST NOT add any client-side
role/permission check, hide, or disable logic around this sub-view — it MUST
render visible and interactive for any dashboard session. Authorization remains
enforced exclusively server-side by the existing proxies
(`app/api/operator/businesses/[id]/lifecycle/route.ts`,
`.../state-events/route.ts`), which already reject non-operator sessions via
`isAuthedOperator` (`app_metadata.role === 'operator'`). This decision assumes
the dashboard's sole current user holds the operator role; no new authorization
requirement is introduced by this capability.

#### Scenario: Operator session performs a lifecycle change

- GIVEN a dashboard session with `app_metadata.role === 'operator'`
- WHEN the operator flips the lifecycle switch to `SUSPENDED`
- THEN the proxy accepts the request and the Business lifecycle updates

#### Scenario: Non-operator session sees the same control, server rejects the write

- GIVEN a dashboard session without the operator role
- WHEN that session attempts to flip the lifecycle switch
- THEN the switch and selector are rendered exactly as for an operator session
- AND the underlying proxy request is rejected server-side (no UI-level hiding)

### Requirement: State Event History Table

The Histórico tab MUST render a table of `TenantStateEvent` rows for the
selected Business — columns: estado, fecha/hora, motivo — via
`fetchBusinessStateEvents`. The system MUST NOT introduce a new model or table
for this history; it consumes `TenantStateEvent` as-is.

#### Scenario: Table lists chronological events

- GIVEN a Business with 3 recorded state transitions
- WHEN the operator selects that Business in Histórico
- THEN the table shows 3 rows ordered by fecha/hora
- AND each row shows estado and motivo as stored in `TenantStateEvent`

#### Scenario: No events yet shows empty state

- GIVEN a Business with zero `TenantStateEvent` rows
- WHEN the operator selects that Business in Histórico
- THEN the table renders an empty state, not an error
