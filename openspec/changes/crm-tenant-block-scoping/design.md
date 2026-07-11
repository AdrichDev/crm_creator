# Design: Scope tenant kill-switch block to the affected business

## Technical Approach

Front-side, business-scoped blocking plus one reviewed back change. The block store carries
`{ variant, businessId }`; the interceptor only flags business-panel 423/410 (shell paths are
allow-listed) and records the sent `x-business-id`; the overlay mounts only when
`blockedBusinessId === getActiveBusinessId()` and clears on business switch. On the back, the
IDENTITY bootstrap (`/auth/me`) is exempted from the hard kill switch so the shell can always
resolve "who am I + which businesses" (the switcher's source), while every operable per-business
endpoint stays gated (contract byte-for-byte unchanged).

## Naming clarification (drove the `/me` decision)

- `/api/me/*` (`meRouter`, routes/index.ts:83, AFTER the gate) is CLIENT **business data**
  (profile/bookings/packages) — genuinely per-business, MUST stay scope-blocked. It is NOT identity.
- `/api/auth/me` (`authRouter`, auth.ts:68) is the real IDENTITY + membership-list bootstrap. It is
  mounted before the blanket `tenantGate()` but runs its OWN inline `loginTenantGate` (auth.ts:66),
  so a SUSPENDED active business 423s it today. `memberships[]` in its payload is what the switcher needs.

## Architecture Decisions

### Decision: shell reachability of identity (`/auth/me`)

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| (a) Fully exempt `/auth/me` from gate | Simplest; but returns operable `business` config for a suspended tenant — "entrar a mirar" | Rejected |
| (b) Front caches last-good `/auth/me`, serves stale on 423 | No back change; but cold-boot while suspended has no cache → shell cannot render switcher | Rejected |
| (c) Degrade `/auth/me`: always return `user` + `memberships` + `activeBusinessId` + `lifecycle`; gate only the operable `business` context | Tiny diff; identity/business-list always reachable; "no entrar a mirar" preserved (business config null when not ACTIVE/GRACE) | **Chosen** |

**Rationale**: identity is not business data — analogous to already-exempt `/service/operator` and
`/tenant-status`. Cold-boot must work (product mandate: OperaOS never down), which kills front-only
(b). (c) keeps the kill switch honest: operable data endpoints remain gated, only "who am I / my
businesses" is guaranteed. Replace `loginTenantGate` on the `/auth/me` handler with an inline
lifecycle read that nulls `business` and returns `lifecycle` when the active tenant is SUSPENDED/TERMINATED.

### Decision: what triggers the overlay

**Choice**: path allow-list + businessId match, not header presence. Shell calls still send
`x-business-id`, so "header present" cannot discriminate. Allow-list PREFIXES: `/auth`,
`/tenant-status`, `/tenant-config`, `/service/operator`. **Rationale**: `/me/*` (CLIENT data) is
deliberately excluded — a CLIENT viewing their suspended business's panel SHOULD see the scoped block.

## Data Flow

```
apiFetch(path) --x-business-id=activeBiz--> back tenantGate --423/410-->
  flagTenantBlocked(path,status,code,activeBiz)
    path in allowlist? -> return (no flag)          // shell stays operable
    else classify -> setTenantBlocked({variant, businessId: activeBiz})
      -> store notifies -> overlay: businessId === getActiveBusinessId() ? <BlockedScreen> : null

business switch: openProject(newId) -> setItem(BUSINESS_KEY) -> reconcileTenantBlock(newId)
  -> if current.businessId !== newId: setTenantBlocked(null) -> overlay unmounts
```

## Files Affected

| Path | Change | Why |
|------|--------|-----|
| `front/lib/tenant/blocked-state.ts` | Modify | State becomes `{ variant, businessId } \| null`; add `reconcileTenantBlock(activeId)`; `subscribe`/`get` carry the object |
| `front/lib/api/client.ts` | Modify | Add allow-list; `flagTenantBlocked(path,status,code,businessId)`; update all 3 call sites (`apiFetch`/`apiFetchBlob`/`apiUpload`) to pass path + sent businessId |
| `front/components/tenant/tenant-block-overlay.tsx` | Modify | Compare `blocked.businessId === getActiveBusinessId()`; render null on mismatch |
| `front/lib/tenant-config-context.tsx` | Modify | `openProject(id)` calls `reconcileTenantBlock(id)` after setting `BUSINESS_KEY` (L251) |
| `back/src/routes/auth.ts` | Modify | `/auth/me`: drop hard `loginTenantGate`; inline lifecycle read degrades `business`→null + adds `lifecycle` for non-ACTIVE active tenant |
| `front/lib/auth/session.ts` | Read | `getActiveBusinessId()` is the scoping key (unchanged) |

Back gate (`tenant-gate.ts`), 423/410 bodies, and all data-route mounts are unchanged.

## Interfaces / Contracts

```ts
type TenantBlocked = { variant: 'suspended' | 'terminated'; businessId: string } | null;
// /auth/me (degraded): { user, memberships, activeBusinessId, role, business: BusinessConfig | null, lifecycle: TenantLifecycle }
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | blocked-state carries `{variant,businessId}`; `reconcileTenantBlock` clears on different id | Vitest, direct store calls |
| Unit | interceptor: `/auth/me` 423 → store null; `/customers` 423 → set w/ businessId==sent x-business-id | Vitest, mock `@/lib/auth/session` + `fetch` (mirror `tenant-blocked-interceptor.test.ts`) |
| Component | overlay mounts when `blocked.businessId===active`, null when differ / after reconcile | Vitest + Testing Library |
| Integration (back) | `/auth/me` under SUSPENDED active tenant returns 200 identity + memberships (not 423), `business:null`, `lifecycle:SUSPENDED` | node:test, mirror `login-gate.test.ts` (auth.ts:63) |

## Migration / Rollout

No data migration. Pure code. Rollback = git revert the front trio + the single `/auth/me` handler edit.

## Open Questions

- [ ] Keep `role` in degraded `/auth/me` (needed by switcher for target-business UI) — yes, membership role is not operable data. Confirm with reviewer during apply.
