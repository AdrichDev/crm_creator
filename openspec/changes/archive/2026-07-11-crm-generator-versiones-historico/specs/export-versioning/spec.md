# Export Versioning Specification

## Purpose

Persist every completed export job as a durable, versioned artifact tied to a
`Business`, replacing today's in-memory-only export job (`export-job-manager.ts`).
Exposes the query surface used by `dashboard-generados` (list, download, distinct
project count) and the semver capture flow for re-exports.

## Requirements

### Requirement: ExportVersion Row Creation

The system MUST create exactly one `ExportVersion` row per completed export job,
linked to `Business.id`, only after the export artifact upload to Supabase Storage
succeeds. Order MUST be: generate artifact → upload to Storage → write row.

#### Scenario: Successful export creates a version row

- GIVEN an export job finishes generating a ZIP artifact
- WHEN the upload to Supabase Storage succeeds
- THEN one `ExportVersion` row is created linked to that `Business.id`

#### Scenario: Storage upload failure does not create a row

- GIVEN an export job finishes generating a ZIP artifact
- WHEN the upload to Supabase Storage fails
- THEN no `ExportVersion` row is created
- AND the export job is reported as failed, not silently lost

> **Implementation note (recorded at archive time):** the shipped implementation
> deviates from this scenario's second assertion. Per an explicit design.md
> decision, a Storage upload failure logs the error (no secrets) and does NOT mark
> the export job as failed — the requested artifact(s) remain downloadable via the
> existing `downloadHandler`; only the historical `ExportVersion` row is skipped.
> This deviation was authorized by the user before implementation and confirmed
> correct (not flagged) by `sdd-verify` (see verify-report, Engram #863).

### Requirement: ExportVersion Schema

The system MUST define `ExportVersion` (Prisma model, `@@map` snake_case DB
convention) with fields: `businessId`, `version` (semver string), `changeNote`
(nullable string), `format` (one of the 4 existing export formats: web-zip, apk,
exe, ipa), `storagePath`, `createdAt`. The migration MUST be additive — no DROP of
existing tables or columns (`Business.generadoEn`, `Project.generatedAt` remain
untouched).

#### Scenario: Migration applies without dropping legacy fields

- GIVEN the current schema with dead fields `Business.generadoEn` and
  `Project.generatedAt`
- WHEN the `ExportVersion` migration is applied
- THEN both dead fields still exist unchanged
- AND `prisma migrate status` reports no drift

> **Implementation note (recorded at archive time):** `format` is always persisted
> as the literal `"source"` (a zip of `ctx.frontDir`, the shared source directory
> generated before any format-specific builder runs), not one of
> web-zip/apk/exe/ipa. This is an explicit design.md decision: the historical
> record versions the source code, not each individual requested binary. Also
> authorized and confirmed correct by `sdd-verify`.

### Requirement: First Export Auto-Versioning

The system MUST assign version `1.0.0` automatically to a Business's first
`ExportVersion` row, without prompting the operator for a version number or
comment. `changeNote` MUST be null for this auto-versioned row.

#### Scenario: First export of a new Business

- GIVEN a Business with zero prior `ExportVersion` rows
- WHEN the operator completes an export
- THEN the created row has `version = "1.0.0"` and `changeNote = null`
- AND the operator was not prompted for version input

### Requirement: Manual Versioning From Second Export Onward

The system MUST prompt the operator for an explicit semver `version` and an
optional commit-message-style `changeNote` when the target Business already has
≥1 `ExportVersion` row. The system MUST reject a submitted version that is not
strictly greater (semver order) than the Business's latest existing version.

#### Scenario: Second export requires manual version input

- GIVEN a Business with one existing `ExportVersion` (`1.0.0`)
- WHEN the operator starts a new export for that Business
- THEN the operator is prompted to enter `version` and `changeNote`

#### Scenario: Duplicate or lower version is rejected

- GIVEN a Business whose latest version is `1.1.0`
- WHEN the operator submits `1.0.0` or `1.1.0` as the new version
- THEN the export is rejected with a validation error
- AND no `ExportVersion` row is created

### Requirement: Distinct-Project Counter

The system MUST expose a count of DISTINCT `businessId` values with ≥1
`ExportVersion` row (not a raw `ExportVersion` row count) for the dashboard header
"generados" metric.

#### Scenario: Re-export does not increment the counter

- GIVEN a Business with one existing `ExportVersion` row
- WHEN the operator re-exports that Business (creating a second row)
- THEN the distinct-project count is unchanged

#### Scenario: First export of a new project increments the counter

- GIVEN a Business with zero `ExportVersion` rows
- WHEN the operator completes its first export
- THEN the distinct-project count increases by exactly 1

### Requirement: Signed-URL Download

The system MUST generate a temporary signed Supabase Storage URL on-demand per
download request. The system MUST NOT expose a permanent or public URL for any
`ExportVersion` artifact.

#### Scenario: Operator downloads an old version

- GIVEN an `ExportVersion` row with `storagePath` set
- WHEN the operator requests download of that row
- THEN a freshly generated, time-limited signed URL is returned
- AND the returned artifact matches the original source of that version

### Requirement: No Retention Policy (Known Debt)

The system MUST retain all `ExportVersion` rows and their Storage artifacts
indefinitely in this change. This change MUST NOT implement TTL-based deletion,
version-count caps, or any automated cleanup job — same accumulation pattern as
`TenantApiKey` today. This is documented technical debt, not solved here.

#### Scenario: Multiple versions of the same Business are all retained

- GIVEN a Business with 5 prior `ExportVersion` rows
- WHEN time passes with no manual deletion
- THEN all 5 rows and artifacts remain accessible for download
