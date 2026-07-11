# Proposal: Scope tenant kill-switch block to the affected business (OperaOS shell never blocks)

## Intent

The back-end lifecycle gate (`crm-tenant-lifecycle-gate`) correctly suspends/terminates
**per business** (`Business.lifecycle`, `tenant-gate.ts` returns 423/410 only for the
affected business). But the FRONT block is a MODULE-GLOBAL flag: `blocked-state.ts` holds
a single `current: TenantBlockedVariant | null`, and any 423/410 from ANY request mounts a
full-screen overlay (`tenant-block-overlay.tsx`) over the WHOLE app. Because `client.ts`
sends `x-business-id` (from `getActiveBusinessId()`) on every call — including shell calls
like `/me` — a single suspended business makes the entire platform look down.

Product mandate (owner): "the CRM projects get suspended, OperaOS NEVER gets suspended."
The shell (login, `/me`, business switcher, operator panel, cross-business nav) must stay
operable; only the suspended business's own panel/view should block.

## Scope

### In Scope
- Business-scope the front block state (carry the blocked `businessId`, not just variant).
- Front interceptor classifies requests: platform/shell paths never trigger the overlay.
- Overlay mounts only when the blocked business == the business the current view depends on;
  clears/re-evaluates when the active business changes.
- Keep the legitimate case working: viewing the suspended business's panel still blocks (scoped).

### Out of Scope
- Any change to the back-end gate's suspend/terminate logic or 423/410 contract (unchanged).
- Redesign of the block screen copy/visual.
- Grace-period / reactivation flows (owned by `crm-tenant-lifecycle-gate`).

## Capabilities

### New Capabilities
- `tenant-block-scoping`: front-side rule that scopes the kill-switch overlay to the affected
  business and exempts OperaOS shell surfaces.

### Modified Capabilities
- None at back-end spec level (gate contract preserved). Front behavior only.

## Approach

Recommended: **path-classified blocking + business-scoped store** (combine diagnosis lines 1 & 3),
with a flagged decision on shell reachability of `/me` (line 2):
1. `blocked-state.ts` stores `{ variant, businessId }`; consumers compare against `getActiveBusinessId()`.
2. `client.ts` interceptor: shell allowlist (`/me`, `/auth/*`, `/tenant-status`, business list,
   `/service/operator`) never calls `flagTenantBlocked`; business-panel calls pass the sent `businessId`.
3. Overlay renders only when `blockedBusinessId === activeBusinessId`; a business switch clears stale blocks.
4. **Decision for design**: `/me` is mounted AFTER `tenantGate()` (routes/index.ts L80 gate, L83 `/me`),
   so a suspended active business 423s the identity call. Options: (a) front allowlist only + tolerate
   `/me` 423 via cached fallback; (b) move `/me` (or a shell-safe identity subset) before the gate;
   (c) add a lightweight pre-gate shell endpoint. Lean (b)/(c); needs review to keep row-scoping.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `front/lib/tenant/blocked-state.ts` | Modified | State carries `businessId`; scoped classify/set/get |
| `front/lib/api/client.ts` | Modified | Shell allowlist; pass request `businessId` to flag |
| `front/components/tenant/tenant-block-overlay.tsx` | Modified | Mount only when blocked biz == active biz |
| `front/lib/auth/session.ts` | Read | `getActiveBusinessId()` is the scoping key |
| `back/src/routes/index.ts` | Decision | Possible `/me` re-order before gate (design phase) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| In-flight requests for the OLD active business after a switch set a stale block | Med | Store `businessId`; clear/re-evaluate on active-business change |
| Over-broad shell allowlist lets a suspended panel appear operable | Low | Back gate stays source of truth (still 423s panel data); overlay is UX-only |
| Weakening the back kill switch by accident | Low | No back gate logic change; only optional `/me` route order, reviewed |
| Legitimate block lost (user inside suspended panel not blocked) | Low | Scoped-match still mounts overlay when viewing that business |

## Rollback Plan

Front-only revert of `blocked-state.ts`, `client.ts`, `tenant-block-overlay.tsx` (git revert of the
change commit) restores the global-block behavior. If the `/me` route re-order is adopted, revert the
single ordering line in `back/src/routes/index.ts`.

## Dependencies

- `crm-tenant-lifecycle-gate` (shipped): supplies the 423/410 contract this change consumes. Must not weaken it.

## Success Criteria

- [ ] A 423/410 for the active business no longer covers login, `/me`, the business switcher, or the operator panel.
- [ ] Overlay appears only when the user is viewing the suspended/terminated business's panel.
- [ ] Switching the active business to a healthy one clears a stale block within one interaction.
- [ ] Back-end gate behavior and 423/410 responses are byte-for-byte unchanged.
