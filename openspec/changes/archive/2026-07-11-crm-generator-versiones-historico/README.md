# ARCHIVE — crm-generator-versiones-historico

**Closed:** 2026-07-11
**Level:** 3 — Large
**Status:** COMPLETED

This change was archived per the SDD protocol. It contains the proposal, validation,
design, tasks, and delta specs of this historical change.

The work was completed per `tasks.md` (all 9 phases, WU1-WU8 + closure, 100% checked):
- **Phase 1 (WU1):** additive `ExportVersion` Prisma model + migration, applied to
  Supabase production.
- **Phase 2 (WU2):** Supabase Storage helper (`storage-exports.ts`), private bucket
  `export-artifacts` provisioned.
- **Phase 3 (WU3):** backend integration — `onComplete` callback, semver validation,
  auto-`1.0.0` first export, `GET /versions` and `GET /versions/:id/download` endpoints.
- **Phase 4 (WU4):** frontend version/comment capture dialog on re-export.
- **Phase 5 (WU5):** dashboard tab plumbing (`Generados`, `Histórico` inserted between
  `Proyecto` and `Exportar`) + API client.
- **Phase 6 (WU6):** "Generados" tab (version table with download + service status).
- **Phase 7 (WU7):** "Histórico" tab (project selector + embedded `LifecycleControl`,
  reused without duplication from `crm-tenant-lifecycle-gate`).
- **Phase 8 (WU8):** header "generados" counter bound to backend distinct-project count.
- **Phase 9:** closure verification — `prisma migrate status` no drift, `tsc` clean,
  full back/front test suites green, human approval before merge.

Tests: back `node:test` 858/858 green, front `vitest` 748/748 green, `tsc --noEmit`
clean on both sides. Verification verdict: **PASS-WITH-NOTES** (0 CRITICAL, 2 WARNING,
1 SUGGESTION — see `ARCHIVE-REPORT.md`). Merged to `main` via commit `3810b67` and
pushed to `origin` with explicit user approval; the `version_export` migration was
applied to Supabase production and the `export-artifacts` bucket was provisioned before
merge.

**Artifacts:**
- `proposal.md` — approved intent and scope
- `validation.md` — acceptance criteria + Given-When-Then scenarios (per-task tests)
- `design.md` — technical architecture and decisions
- `tasks.md` — work breakdown, all checkboxes closed including human-gated ones
- `specs/export-versioning/spec.md` — delta spec (2 implementation-note annotations for
  pre-authorized, verify-confirmed deviations)
- `specs/dashboard-generados/spec.md` — delta spec (unmodified)
- `specs/dashboard-historico/spec.md` — delta spec (unmodified)

**Note for the future:** if this change needs to be reopened, restore the folder from
`openspec/changes/archive/2026-07-11-crm-generator-versiones-historico/` to
`openspec/changes/crm-generator-versiones-historico/`. Full history and context (Engram
observations #856-#864) are preserved for traceability.
