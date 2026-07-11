# Validation: crm-tenant-block-scoping

## User Story

As the OperaOS product owner (and any operator managing multiple CRM businesses),
I want the tenant kill-switch block to cover ONLY the suspended/terminated business's
own panel, so that OperaOS itself (login, `/me`, the business switcher, the operator
panel, and healthy businesses) stays fully usable — never giving the false impression
that the whole platform is down when a single tenant is suspended.

## Acceptance Criteria

- AC1: A 423 `tenant_suspended` or 410 `tenant_terminated` returned from a request whose
  `x-business-id` is the currently ACTIVE business, while the user is viewing that business's
  panel, mounts the scoped block overlay for that view.
- AC2: The same 423/410 does NOT mount the overlay for OperaOS shell surfaces — login,
  `/me`, the business list/switcher, and `/service/operator` are never blocked by a tenant's state.
- AC3: The block state carries the affected `businessId`; the overlay renders only when
  `blockedBusinessId === getActiveBusinessId()`.
- AC4: Switching the active business to a healthy one clears the stale block (overlay unmounts)
  without a full reload.
- AC5: The back-end lifecycle gate contract (per-business 423/410, exemptions) is unchanged —
  this change is front-side scoping plus, at most, a reviewed `/me` route-order decision.

## Given-When-Then Scenarios

### Scenario 1 — suspended active business blocks only its own panel
- Given the active business `biz-A` has `lifecycle = SUSPENDED` and the user is on `biz-A`'s panel,
- When a business-panel request (e.g. `/customers`) returns 423 `tenant_suspended`,
- Then the block overlay mounts scoped to `biz-A` (variant `suspended`).

### Scenario 2 — shell survives a suspended active business
- Given the active business `biz-A` is `SUSPENDED`,
- When the shell calls `/me` (which returns 423 because it is gated) or the user opens the business switcher,
- Then no global overlay is mounted and the shell (login/switcher/operator) stays operable.

### Scenario 3 — switching to a healthy business clears the block
- Given the block overlay is mounted for suspended `biz-A`,
- When the user switches the active business to healthy `biz-B` (`getActiveBusinessId()` → `biz-B`),
- Then the overlay unmounts because `blockedBusinessId (biz-A) !== activeBusinessId (biz-B)`.

## Test Plan (1 test per anticipated task)

| Task (anticipated WU) | Test |
|-----------------------|------|
| T1: `blocked-state.ts` carries `{ variant, businessId }` (scoped set/get/classify) | Unit: `setTenantBlocked({variant,businessId})` then `getTenantBlocked()` returns both; setting a different businessId while a block exists is tracked per-business. |
| T2: `client.ts` shell allowlist — shell paths never flag block | Unit: `apiFetch('/me')` returning 423 `tenant_suspended` leaves `getTenantBlocked()` null; `apiFetch('/customers')` with same error sets it. |
| T3: `client.ts` passes the request `x-business-id` into the flag | Unit: business-panel 423 records `businessId` equal to the sent `x-business-id` (`biz-A`). |
| T4: overlay scoping — mounts only when blocked biz == active biz | Component/unit: overlay renders when `blockedBusinessId === activeBusinessId`; renders null when they differ (switch to `biz-B`). |
| T5 (decision-dependent): `/me` shell reachability | Back/integration: with active business SUSPENDED, the shell-identity path resolves user + business list without being killed by the gate (per the option chosen in design). |

> Test framework: front unit tests use Vitest (mirror `front/tests/tenant-blocked-interceptor.test.ts`,
> mocking `@/lib/auth/session`). Back test (T5) only if the `/me` route-order option is adopted.
> A task is DONE only when its test is green.
