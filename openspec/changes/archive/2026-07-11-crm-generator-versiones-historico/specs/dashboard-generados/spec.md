# Dashboard "Generados" Specification

## Purpose

Give the operator a "Generados" tab inside the generator dashboard
(`front/app/dashboard`) listing every generated project with its version
history, per-version download, and current service status — sourced from the
`export-versioning` capability instead of the dead `Project.generatedAt`
localStorage field.

## Requirements

### Requirement: Tab Placement

The system MUST add a "Generados" `Tab` in `dashboard-tabs.tsx` positioned
between the existing "Proyecto" and "Exportar" tabs, without modifying either of
those existing tabs.

#### Scenario: Tab order

- GIVEN the dashboard tab bar
- WHEN it renders
- THEN the order is Proyecto → Generados → Histórico → Exportar
- AND Proyecto and Exportar behave exactly as before this change

### Requirement: Version Table Content

The Generados tab MUST render a table with one row per `ExportVersion`, showing:
client name (`Business.name`), date/time (`createdAt`), version, a download
action, and the Business's current service status.

#### Scenario: Renders a row per version

- GIVEN a Business with 3 `ExportVersion` rows
- WHEN the operator opens Generados
- THEN 3 rows appear for that client, each with its own version and timestamp

### Requirement: Service Status via Lifecycle

The service-status column MUST display the Business's current `lifecycle` value
(`ACTIVE`/`GRACE`/`SUSPENDED`/`TERMINATED`). If the Business has never passed the
lifecycle gate, the column MUST display "sin desplegar" instead of a lifecycle
value.

#### Scenario: Never-deployed project shows fallback label

- GIVEN a Business with `ExportVersion` rows but no lifecycle gate history
- WHEN Generados renders that row
- THEN the status column shows "sin desplegar"

#### Scenario: Lifecycle state is reflected

- GIVEN a Business currently in `SUSPENDED` state
- WHEN Generados renders that row
- THEN the status column shows `SUSPENDED`

### Requirement: Header Counter Binding

The dashboard header "generados" counter (`front/app/dashboard/page.tsx`) MUST be
bound to the backend distinct-`businessId` count exposed by `export-versioning`,
replacing the current localStorage-derived `Project.generatedAt` binding.

#### Scenario: Counter matches distinct businesses with exports

- GIVEN 4 distinct Businesses with ≥1 `ExportVersion` each, and one of them
  re-exported twice
- WHEN the header renders
- THEN the counter shows 4, not 5

### Requirement: Download Action

Clicking the download action for a version row MUST call the signed-URL
download endpoint for that specific `ExportVersion` and MUST NOT trigger a fresh
build or regeneration of the export.

#### Scenario: Download old version returns original source

- GIVEN a version row for `1.0.0` of a Business now at `1.2.0`
- WHEN the operator clicks download on the `1.0.0` row
- THEN the browser receives the exact `1.0.0` artifact via signed URL
- AND no new export job is triggered
