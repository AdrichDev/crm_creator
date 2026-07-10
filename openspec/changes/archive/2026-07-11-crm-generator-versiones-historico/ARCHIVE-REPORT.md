# ARCHIVE REPORT — crm-generator-versiones-historico

**Date:** 2026-07-11
**Status:** COMPLETED AND ARCHIVED
**Change Name:** crm-generator-versiones-historico
**Archive Location:** `openspec/changes/archive/2026-07-11-crm-generator-versiones-historico/`
**Repo:** `creador_CRM` (branch `main`)

---

## Executive Summary

The change `crm-generator-versiones-historico` is complete, merged, pushed, and archived.
It gives the OperaOS generator dashboard persistent memory of what it produces: a
versioned, downloadable export history ("Generados") and an embedded lifecycle/audit
view ("Histórico"), replacing the dead `Project.generatedAt` localStorage counter with a
real backend-derived distinct-project count. Verification returned PASS-WITH-NOTES (0
CRITICAL, 2 WARNING, 1 SUGGESTION, all non-blocking). All human-in-the-loop gates
(production migration, Storage bucket provisioning, final merge approval) were completed
by the user before merge.

---

## Change Scope & Completion Status

### Original Intentions (Proposal)
1. **"Generados" tab**: version table (client, date/time, semver, download, service
   status) sourced from a new persistent `ExportVersion` model instead of the in-memory
   export job.
2. **"Histórico" tab**: project selector + embedded `LifecycleControl` (reused from
   `crm-tenant-lifecycle-gate`) + `TenantStateEvent` audit table, without leaving the
   dashboard.
3. **Header counter fix**: count of distinct Businesses with ≥1 export, not raw
   export/job count.

### Acceptance Criteria (validation.md, AC1-AC7)
All 7 covered by real passing tests plus code review (see verify-report, Engram #863):
- AC1 persistence order (generate → upload → register) — covered.
- AC2 first-export auto-`1.0.0`, semver validation on re-export — covered.
- AC3 distinct-project counter, re-export does not increment — covered.
- AC4 signed-URL download, no regeneration — covered.
- AC5 Generados columns incl. "sin desplegar" fallback — covered.
- AC6 Histórico selector + embedded `LifecycleControl`, no UI role-gate — covered.
- AC7 no regression, additive migration, tests green — covered.

### Final Status
**State:** CLOSED — all 9 phases (WU1-WU8 + closure) complete, all `tasks.md` checkboxes
`[x]`, including the human-gated ones (1.2, 1.3, 1.4, 2.1, 9.1, 9.6).
- **Tests (real runs, verify-report Engram #863):** back `node:test` 858/858 pass (225
  suites); front `vitest` 748/748 pass (112 files); `tsc --noEmit` 0 errors on both
  front and back; `prisma validate` clean.
- **Migration:** `20260710160000_export_version` — pure additive (`CREATE TABLE
  crm.version_export`, index, FK `ON DELETE/UPDATE CASCADE`), applied to Supabase
  production. `prisma migrate status` up-to-date (29 migrations).
- **Storage:** private bucket `export-artifacts` provisioned by the user.
- **Merge:** merged to `main` via merge commit `3810b67`, pushed to `origin` with
  explicit user confirmation ("migracion hecha y bucket tambien, mergea a main y push").

---

## Archived Artifacts

### Location Structure
```
openspec/changes/archive/2026-07-11-crm-generator-versiones-historico/
├── ARCHIVE-REPORT.md              [this file]
├── README.md                      [archive overview]
├── proposal.md                    [intent + approved scope]
├── validation.md                  [AC + Given-When-Then + per-task tests]
├── design.md                      [technical decisions + architecture]
├── tasks.md                       [work breakdown, all checkboxes closed]
└── specs/
    ├── export-versioning/spec.md      [delta spec, annotated with 2 authorized deviations]
    ├── dashboard-generados/spec.md    [delta spec, unmodified]
    └── dashboard-historico/spec.md    [delta spec, unmodified]
```

### Key Decision Documentation
- **Persistence trigger:** `onComplete` callback injected into `export-job-manager.ts`
  (not coupled to Prisma/Storage directly) — keeps the job manager DI-pure and testable.
- **Source of the versioned artifact:** always `ctx.frontDir` (the shared source
  directory generated before any format-specific builder runs), independent of which
  `formats` (web-zip/apk/exe/ipa) the operator requested.
- **Failure isolation:** Storage upload failure does not fail the export job — the
  requested artifact(s) remain downloadable; only the historical `ExportVersion` row is
  skipped, logged without secrets.
- **Versioning UX:** first export of a Business auto-versions `1.0.0` with no prompt;
  from the second export onward, the operator must supply a strictly-greater semver +
  optional `changeNote`.
- **No frontend role gate:** `LifecycleControl` renders identically for any dashboard
  session; authorization is enforced exclusively server-side by the existing
  `/api/operator/**` proxies (`isAuthedOperator`).

---

## Specs Synced

**Target:** No `openspec/specs/` (main-spec source-of-truth) directory exists in this
repo — confirmed by filesystem scan (`openspec/config.yaml` also does not exist). This
matches the established precedent from the only prior archived change
(`archive/2026-07-02-crm-castellano-supabase-total/ARCHIVE-REPORT.md`: "N/A — no hay
main spec a nivel openspec. Delta spec archivado como histórico."). No merge target was
created; the repo convention treats delta specs as archived historical documents, not as
inputs to a living source-of-truth spec tree.

| Domain | Action | Details |
|--------|--------|---------|
| `export-versioning` | Archived (annotated) | Copied verbatim from the change folder; 2 implementation-note blocks added recording pre-authorized deviations from 2 scenarios (Storage-failure-does-not-fail-job; `format` always `"source"`), both confirmed correct by verify-report and NOT flagged as issues. |
| `dashboard-generados` | Archived (unmodified) | Copied verbatim; all requirements implemented and test-covered as written. |
| `dashboard-historico` | Archived (unmodified) | Copied verbatim; all requirements implemented and test-covered as written. |

---

## Cross-References & Dependencies

### Linked Memory (Engram)
- `#856` — `sdd/crm-generator-versiones-historico/proposal`
- `#857` — `sdd/crm-generator-versiones-historico/spec` (validation.md authored)
- `#858` — `sdd/crm-generator-versiones-historico/design`
- `#859` — `sdd/crm-generator-versiones-historico/tasks`
- `#860` — session summary (design phase, post-compaction resume)
- `#861` — decision: version always archived from `ctx.frontDir`, independent of `formats`
- `#862` — `sdd-apply` progress checkpoint (post-compaction)
- `#863` — `sdd/crm-generator-versiones-historico/verify-report` — PASS-WITH-NOTES
- `#864` — merge/push confirmation (commit `3810b67`), migration + bucket applied

### Dependencies Consumed (not modified)
- `crm-tenant-lifecycle-gate` (already merged): `Business.lifecycle`,
  `TenantStateEvent`, lifecycle endpoints, `lifecycle-control.tsx`. Reused as-is; this
  change introduced zero modifications to that capability's requirements.

### Related Concurrent Work (confirmed out of scope, not touched by this change)
- `crm-tenant-lifecycle-gate` WU6 purge feature (`service-operator.ts`,
  `service-operator-purge.ts`, `purge.guard.test.ts`) — verified by `sdd-verify` as a
  scope-clean, unrelated concurrent change left uncommitted in the working tree at
  merge time. Not part of this archive.
- 4 untracked `openspec/changes/crm-voice-*` folders — untouched, not part of this
  change or this archive.

---

## Outstanding Items (Documented Debt, Not Implemented — By Design)

1. **Storage retention/TTL policy**: `export-artifacts` accumulates indefinitely, no
   automated cleanup. Same pattern as `TenantApiKey` minting. Deferred to a future
   change (documented in design.md "Límites / Deuda conocida").
2. **Per-binary versioning**: `format` is always `"source"` (the frontDir zip);
   individual APK/EXE/IPA binaries are not versioned separately in this change.
3. **Semver numeric-vs-lexical regression test**: verify-report flagged (WARNING, not
   CRITICAL) the absence of a dedicated test for `1.10.0 > 1.9.0` — the comparison logic
   was confirmed correct by code inspection (`Number()`-based per-segment parsing) but
   has no explicit regression test.
4. **`changeNote` length cap**: verify-report flagged (WARNING, low severity) the
   absence of a server-side or client-side length limit on `changeNote` — no injection
   risk (Prisma-parameterized, escaped React text) but allows unbounded storage growth
   via a single field.

None of these block archival — 0 CRITICAL issues per verify-report, and all are
explicitly pre-authorized or non-blocking per the SDD archive rules.

---

## Risks & Mitigations

### Risk: Migration applied to real production database
- **Mitigation:** additive-only migration (`CREATE TABLE` + index + FK, no
  `DROP`/`ALTER` of existing tables/columns); required explicit human gate (tasks 1.2,
  1.3, 1.4) before application.
- **Status:** PASSED — applied, `prisma migrate status` reports up-to-date, no drift.

### Risk: New infrastructure dependency (Supabase Storage bucket)
- **Mitigation:** bucket kept private (no public URL exposure); downloads only via
  short-lived (60s TTL) signed URLs; provisioning required explicit human gate (task
  2.1).
- **Status:** PASSED — bucket provisioned by the user, verified private.

### Risk: Cross-tenant data leakage via download endpoint
- **Mitigation:** `downloadVersionHandler` returns `404` (never `403`) both when a
  version does not exist and when it exists but belongs to a business outside the
  requester's membership — avoids existence leakage by design.
- **Status:** PASSED — confirmed by verify-report and a dedicated isolation test.

### Risk: Storage upload failure losing the export
- **Mitigation:** the requested export artifact(s) remain downloadable via the
  pre-existing `downloadHandler` regardless of Storage upload outcome; only the
  historical version row is skipped on failure (logged, no secrets).
- **Status:** PASSED — behavior verified by dedicated back-end tests.

---

## Tests & Verification Summary (from verify-report, Engram #863)

### Backend (`node:test`)
```
Total: 858 tests / 225 suites
Passing: 858 (100%)
Failing: 0
Includes: storage-exports.test.ts (7), exports-versions.test.ts (14),
export-job-manager.test.ts (+3 new: onComplete invoked on done / not invoked on
error / failure doesn't revert done+lock), exports-routes.test.ts (extended,
additive-only fake diff)
```

### Frontend (Vitest)
```
Total: 748 tests / 112 files
Passing: 748 (100%)
Failing: 0
Includes: export-table-version-dialog.test.tsx (4),
dashboard-tabs-generador-historico.test.tsx (3: tab order+regression, Generados
table, Histórico selector), dashboard-header-counter.test.tsx (1)
```

### Type Checking
```
Back: tsc --noEmit → 0 errors
Front: tsc --noEmit → 0 errors
```

### Migration
```
prisma validate → schema valid
20260710160000_export_version/migration.sql → pure additive
prisma migrate status (post-apply, production) → up to date, 29 migrations, no drift
```

---

## Archive Procedure Applied

### Archive Pattern (repo precedent, confirmed by filesystem scan)
```
openspec/changes/archive/{DATE}-{change-name}/
```
Followed exactly, matching the sole prior archived change
(`2026-07-02-crm-castellano-supabase-total`). No `openspec/specs/` main-spec directory
and no `openspec/config.yaml` exist in this repo; delta specs are archived as historical
documents only (no merge target), consistent with prior precedent.

### Actions Taken
1. Read all 4 artifacts + 3 delta specs from `openspec/changes/crm-generator-versiones-historico/`.
2. Retrieved and cross-checked Engram observations #856-#864 (proposal through
   apply-progress/merge confirmation) for traceability and final-state verification.
3. Created `openspec/changes/archive/2026-07-11-crm-generator-versiones-historico/` with
   copies of `proposal.md`, `design.md`, `tasks.md`, `validation.md`, and
   `specs/{export-versioning,dashboard-generados,dashboard-historico}/spec.md`.
4. Annotated 2 implementation-note blocks in `specs/export-versioning/spec.md`
   (Storage-failure-does-not-fail-job; `format` always `"source"`) recording
   pre-authorized deviations already confirmed correct by verify-report — original
   requirement/scenario text preserved unmodified.
5. Appended an archive note to `validation.md`'s stale "Estado" footer (which still read
   "PROPUESTA — sin código iniciado" from the design phase) clarifying the real final
   state, without altering the original paragraph.
6. Created this `ARCHIVE-REPORT.md` and the accompanying `README.md`.

### Original Folder Status — Tool Constraint
The executing agent in this session has `Read`/`Write`/`Edit`/`Glob` tools only — no
filesystem delete/move (`Bash`/`mv`) capability was available. Per the explicit task
constraint ("Do NOT commit or push — leave file moves in working tree; I (Gru) will
commit"), the archive folder above was created as full copies of the original artifacts.
**The original `openspec/changes/crm-generator-versiones-historico/` folder was NOT
deleted** — it still exists on disk, unmodified, alongside the new archive copy. Gru (the
orchestrator) should perform the actual `git mv`/deletion of the original folder as part
of the commit that lands this archive, so the working tree ends up with only the archived
copy under `openspec/changes/archive/`.

---

## Traceability

| Artifact | Status | Location |
|----------|--------|----------|
| Proposal | Archived | `archive/2026-07-11-.../proposal.md` (Engram #856) |
| Validation (AC + Given-When-Then) | Archived + annotated | `archive/2026-07-11-.../validation.md` (Engram #857) |
| Design (Technical) | Archived | `archive/2026-07-11-.../design.md` (Engram #858) |
| Tasks (Work Breakdown, 100% closed) | Archived | `archive/2026-07-11-.../tasks.md` (Engram #859) |
| Delta Specs (3 capabilities) | Archived + 2 deviation notes | `archive/2026-07-11-.../specs/*/spec.md` |
| Verify Report | Referenced (Engram-only) | Engram #863 — PASS-WITH-NOTES |
| Apply Progress / Merge Confirmation | Referenced (Engram-only) | Engram #862, #864 — merged `3810b67`, pushed |

---

## Sign-Off

**Archived By:** SDD Archive Executor
**Date:** 2026-07-11
**Scope:** COMPLETE — all 9 phases (WU1-WU8 + closure), all human gates passed
**Test Status:** ALL GREEN (back 858/858, front 748/748, tsc clean both sides)
**Authority:** verify-report PASS-WITH-NOTES (0 CRITICAL) + explicit user merge/push
confirmation (Engram #864)

This change is CLOSED. All work is documented and archived. No further action required
unless reversal/reopening is requested. Remaining Gru action: `git mv`/remove the
original `openspec/changes/crm-generator-versiones-historico/` folder when committing
this archive (see "Original Folder Status" above — not performed by this agent due to
tool constraints).
