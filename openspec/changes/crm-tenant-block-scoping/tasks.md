# Tasks: Scope tenant kill-switch block to the affected business

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~220-280 (4 impl files + 3 test files, small diffs each) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (back degrade + front scoping ship together; contract coupling) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Back: degrade `/auth/me` off hard gate | PR 1 (single PR) | `back/src/routes/auth.ts` + mirror test; must land first, front depends on stable `business: null` contract |
| 2 | Front: business-scoped block store + interceptor + overlay + reconcile | PR 1 (single PR) | `blocked-state.ts`, `client.ts`, `tenant-block-overlay.tsx`, `tenant-config-context.tsx` + tests |

## Phase 1: Back — degrade `/auth/me` off the hard gate

- [x] 1.1 In `back/src/routes/auth.ts`, replace `loginTenantGate` (`export const loginTenantGate = tenantGate();`, L66) on the `GET /me` route (L68) with an inline lifecycle read: always resolve `user`, `memberships[]`, `activeBusinessId`, `role`, and `lifecycle` of the active business; set `business: null` when `lifecycle` is not `ACTIVE`/`GRACE`, otherwise populate `business` as today. Covers spec `tenant-lifecycle` Requirement "Gate de servicio server-authoritative", scenario "Identidad siempre alcanzable"; validation.md AC5 + Scenario 2 (partial — back side).
- [x] 1.2 Preserve grace-header behavior (`x-tenant-grace-until`) and the existing 401 unauth response; do not touch `tenantGate()` in `back/src/middleware/tenant-gate.ts` (design.md: "Back gate ... unchanged").
- [x] 1.3 Write `back/src/routes/__tests__/auth-me-degraded.test.ts` (mirror `login-gate.test.ts` pattern — DI double via `TenantStateDb`, no real DB): SUSPENDED/TERMINATED active business → `GET /me` returns 200 with `business: null` and `lifecycle` set (not 423/410); ACTIVE/GRACE-valid → `business` present. Covers validation.md Test Plan T5 and spec scenario "Identidad siempre alcanzable".
- [x] 1.4 Run back suite (`node --import tsx --test`) and confirm `login-gate.test.ts` (existing wiring assertions on `loginTenantGate`/`authenticate` order) is updated or removed if it now contradicts the new wiring — keep wiring intent (authenticate before gate logic) if any inline gate remains, else adapt/retire obsolete assertions.

## Phase 2: Front — business-scoped block store

- [x] 2.1 In `front/lib/tenant/blocked-state.ts`, change state shape from `TenantBlockedVariant | null` to `{ variant: TenantBlockedVariant; businessId: string } | null`; update `setTenantBlocked(value)`, `getTenantBlocked()`, `subscribeTenantBlocked` signatures accordingly. Covers spec `tenant-block-scoping` Requirement "Store de bloqueo con alcance de negocio", scenario "Guardar y leer bloqueo con businessId"; validation.md T1.
- [x] 2.2 Add `reconcileTenantBlock(activeBusinessId: string): void` to `blocked-state.ts` — sets state to `null` when the stored `businessId` differs from `activeBusinessId`. Covers spec scenario "Reconciliar limpia bloqueo de otro negocio"; validation.md Scenario 3.
- [x] 2.3 Write/extend unit test for `blocked-state.ts` (new or extend existing front test file colocated with it) covering: set+get roundtrip with `businessId`, and `reconcileTenantBlock` clearing on mismatched id. Covers validation.md T1, spec scenarios "Guardar y leer..." and "Reconciliar limpia...".

## Phase 3: Front — interceptor allowlist + businessId propagation

- [x] 3.1 In `front/lib/api/client.ts`, change `flagTenantBlocked(status, code)` (L32) to `flagTenantBlocked(path, status, code, businessId)`: classify path by prefix allowlist (`/auth`, `/tenant-status`, `/tenant-config`, `/service/operator`) — allowlisted prefixes never call `setTenantBlocked`; other paths on 423/410 call `setTenantBlocked({ variant, businessId })` with the `businessId` that was actually sent as `x-business-id`. Covers spec `tenant-block-scoping` Requirement "Interceptor con allowlist de rutas de plataforma", both scenarios; validation.md T2, T3, AC2.
- [x] 3.2 Update the 3 call sites (`apiFetch` L56, `apiFetchBlob` L81, `apiUpload` ~L100+) to pass `path` and the resolved `businessId` (the same `b` from `getActiveBusinessId()` already computed at L50/75/96) into `flagTenantBlocked`.
- [x] 3.3 Write/extend `front/tests/tenant-blocked-interceptor.test.ts` with: `/auth/me` 423 → `getTenantBlocked()` stays `null`; `/customers` 423 with `x-business-id: biz-A` → `getTenantBlocked()` returns `{ variant: 'suspended', businessId: 'biz-A' }`. Covers validation.md T2 + T3, spec scenarios "Ruta de plataforma no dispara bloqueo" + "Ruta de negocio dispara bloqueo con su businessId".

## Phase 4: Front — overlay scoping + reconcile wiring

- [x] 4.1 In `front/components/tenant/tenant-block-overlay.tsx`, change local state from `TenantBlockedVariant | null` to the full `{variant, businessId} | null` object; render `<BlockedScreen variant={blocked.variant} />` only when `blocked !== null && blocked.businessId === getActiveBusinessId()`, else `null`. Import `getActiveBusinessId` from `@/lib/auth/session`. Covers spec Requirement "Overlay visible solo para el negocio activo bloqueado", both scenarios; validation.md T4, AC3.
- [x] 4.2 In `front/lib/tenant-config-context.tsx`, inside `persistActive` (around L251, right after `localStorage.setItem(BUSINESS_KEY, id)`), call `reconcileTenantBlock(id)` (import from `@/lib/tenant/blocked-state`). Covers spec Requirement "Reconciliación al cambiar de negocio activo"; validation.md AC4, Scenario 3.
- [x] 4.3 Write/extend a component test for `tenant-block-overlay.tsx` (Vitest + Testing Library, mock `@/lib/auth/session` and `@/lib/tenant/blocked-state`): mounts `BlockedScreen` when `blocked.businessId === activeBusinessId`; renders `null` when they differ. Covers validation.md T4.
- [x] 4.4 Write/extend a test for `openProject`/`persistActive` in `tenant-config-context.tsx` (or the closest existing test file for it) asserting `reconcileTenantBlock` is invoked with the new id after switching. Covers validation.md AC4, spec scenario "Cambiar a negocio sano limpia el bloqueo".

## Phase 5: Verification

- [x] 5.1 Back: `tsc --noEmit` clean + full back test suite green (`node --import tsx --test`), including new `auth-me-degraded.test.ts` and any updated `login-gate.test.ts`.
- [x] 5.2 Front: `tsc --noEmit` clean + full front Vitest suite green, including updated `tenant-blocked-interceptor.test.ts`, `blocked-state` unit test, `tenant-block-overlay` component test, `tenant-config-context` reconcile test.
- [ ] 5.3 Run `sdd-verify` / `/code-review` before commit (repo convention — do not skip even with green tests).
- [ ] 5.4 Manual smoke: (a) set a real/demo business to `SUSPENDED`, confirm its own panel shows the scoped block screen but login, `/me`-driven shell chrome, and the business switcher stay usable; (b) from the blocked panel, switch the active business to a healthy one and confirm the overlay clears without a page reload; (c) confirm `/service/operator` stays reachable while a business is suspended.
