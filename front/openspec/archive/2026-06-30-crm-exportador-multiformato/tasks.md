# Tasks: Exportador multi-plataforma + rediseño Dashboard

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1 200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (shared + back infra) → PR 2 (back builders + endpoint) → PR 3 (front UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU-1 | shared/ foundation + back infra | PR 1 | base = main; types, lock, preflight, temp-copy |
| WU-2 | back builders + endpoint | PR 2 | base = PR 1; builders web-zip/exe/apk/ipa + route |
| WU-3 | front Dashboard rediseño + export UI | PR 3 | base = PR 2; tabs, table, progress, hook |

---

## Phase 1: Shared Foundation (RF-10, S-AC1, S-AC2)

- [x] 1.1 Create `creador_CRM/shared/generate/tenant-types.ts` — export `TenantConfig` interface (copy fields from `front/lib/config/tenant-config.ts`); zero React/browser imports; `tsc --noEmit` must pass.
- [x] 1.2 Create `creador_CRM/shared/generate/build-sql.ts` — move pure SQL-generation logic from `front/lib/generate/build.ts`; no `'use client'`, no JSZip, no browser APIs.
- [x] 1.3 Create `creador_CRM/shared/generate/build-prisma.ts` — pure function that returns Prisma schema string; no browser deps.
- [x] 1.4 Create `creador_CRM/shared/generate/build-manifest.ts` — pure function returning `manifest.json` object; no browser deps.
- [x] 1.5 Modify `front/lib/generate/build.ts` — replace inline SQL/Prisma/manifest logic with re-exports from `../../shared/generate/`; keep JSZip + browser glue in this file; `tsc --noEmit` front must pass.
- [x] 1.6 Add `BAKED_TENANT_CONFIG` export to `front/lib/config/tenant-config.ts` — reads `process.env.NEXT_PUBLIC_TENANT_JSON` via `JSON.parse`; returns `TenantConfig | null`; no side effects when var is absent.

## Phase 2: Back Infrastructure (RF-07, RF-08, RF-09, RNF-02, RNF-03, RNF-05, RNF-06)

- [x] 2.1 Create `back/src/lib/export-lock.ts` — `isBuildRunning` boolean, `acquireLock()` returns boolean (false if busy), `releaseLock()` always resets; 20-minute watchdog timer aborts active build and calls `releaseLock()` (manual signal combination, not `AbortSignal.any`).
- [x] 2.2 Create `back/src/lib/export-preflight.ts` — `checkToolchain(format)` resolves binary (electron-builder / java+gradle / xcodebuild) via `which`/`where`; returns `{ ok: boolean; message: string }`.
- [x] 2.3 Create `back/src/lib/export-temp-copy.ts` — `createTempCopy(frontDir, tenantConfig)`: `fs.cpSync` front→`back/tmp/build-<uuid>/`, writes `NEXT_PUBLIC_TENANT_JSON` to `.env.local`; `cleanupTempCopy(tmpDir)`: `fs.rmSync` in `finally`; NEVER touches `front/src/` or `front/.next/`.
- [x] 2.4 Add `"engines": { "node": ">=20.3" }` to `back/package.json` (RNF-02).
- [x] 2.5 Add `tmp/` line to `back/.gitignore` (RNF-03).

## Phase 3: Back Builders (RF-03, RF-04, RF-05, RF-06, RF-09, B-AC4, B-AC5)

- [x] 3.1 Create `back/src/lib/export-builders/web-zip.ts` — `buildWebZip(projectId, outputDir, emit)`: calls `buildSQL`, `buildPrisma`, `buildManifest` from `shared/generate/`; packs into ZIP via `jszip`; emits `format-start → progress → format-done`; zero `next build` calls.
- [x] 3.2 Create `back/src/lib/export-builders/ipa.ts` — `buildIpa(emit)`: if `process.platform !== 'darwin'` → emit `format-error { format:"ipa", message:"Requiere macOS" }` and return; else stub for future macOS path.
- [x] 3.3 Create `back/src/lib/export-builders/exe.ts` — `buildExe(projectId, tenantConfig, outputDir, emit, signal)`: preflight electron-builder → create temp copy → `next build` → `electron-builder` → emit `format-done`; cleanup in `finally`.
- [x] 3.4 Create `back/src/lib/export-builders/apk.ts` — `buildApk(projectId, tenantConfig, outputDir, emit, signal)`: preflight java+gradle → create temp copy → `next build` → `capacitor sync` → `gradlew assembleRelease` → emit `format-done`; cleanup in `finally`.

## Phase 4: Back Endpoint (RF-01, RF-02, RF-07, RF-08, B-AC1–B-AC10)

- [x] 4.1 Create `back/src/routes/exports.ts` — `POST /api/exports` handler: Bearer auth check → 401; lock check → 409; set `Content-Type: application/x-ndjson`; iterate requested formats sequentially; call preflight → builder; emit `complete` with `results[]`; `releaseLock()` in `finally`.
- [x] 4.2 Modify `back/src/routes/index.ts` — import `exportsRouter`; register `api.use('/exports', exportsRouter)` inside the `authenticate` + `staffOnly` chain.

## Phase 5: Front UI (RF-11–RF-15, F-AC1–F-AC11)

- [x] 5.1 Create `front/lib/export/use-export-stream.ts` — React hook: `fetch POST /api/exports` with Bearer; reads `ReadableStream` line-by-line (NDJSON); returns `{ events, isRunning, start, reset }` state; exposes `isRunning` for global lock guard.
- [x] 5.2 Create `front/components/dashboard/export-progress.tsx` — panel/modal component: receives `events[]`; renders per-format status (pendiente → spinner → done ✓ / error ✗); global progress bar (% from `progress.pct`); log text from `step`; shows output path and "Cerrar" button on `complete`.
- [x] 5.3 Create `front/components/dashboard/export-table.tsx` — table with columns Proyecto/Cliente/Tipo/Formatos/Exportar; checkboxes Web ZIP / .exe / .apk / .ipa per row; `.ipa` disabled + tooltip "Requiere macOS" when `navigator.platform` includes Win; outputDir input above table (default `"./exports"`); Exportar button disabled if no checkbox selected or `isRunning`; on click: show "Hay un build en curso" if locked, else call `use-export-stream`.
- [x] 5.4 Create `front/components/dashboard/dashboard-tabs.tsx` — two-tab layout "Dashboard" / "Exportar"; default active = Dashboard; renders project card grid (pestaña Dashboard) or `<ExportTable>` (pestaña Exportar).
- [x] 5.5 Modify `front/app/dashboard/page.tsx` — replace existing card grid with `<DashboardTabs>`; add pagination state (page, 10/page); add client-side filter by name/vertical; remove all "Generar" button occurrences; keep auth gate intact.

## Phase 6: Verification (all AC blocks)

- [x] 6.1 Write unit tests for `export-lock.ts` — cover: acquire when free → true; acquire when busy → false; release always resets; 20-min watchdog fires and releases lock (fake timers).
- [x] 6.2 Write unit tests for `export-preflight.ts` — cover: known tool present → ok; tool missing → `{ ok: false, message: "…not found" }`.
- [x] 6.3 Write unit tests for `export-builders/ipa.ts` — cover: Windows platform → emits `format-error`; no tmp dir created.
- [ ] 6.4 Write integration/smoke test for `POST /api/exports` (web-zip) — OMITIDO por diseño (requiere DB viva, fuera de scope WU-4).
- [x] 6.5 Verify TypeScript: `cd back && npx tsc --noEmit` → 0 errors; `cd front && npx tsc --noEmit` → 0 errors (T-AC1).
- [ ] 6.6 Smoke: open `/dashboard`, click "Exportar" tab → table visible, no "Generar" button; select Web ZIP, click Exportar → progress panel advances to done; second-row click while running → "Hay un build en curso" message. — PENDIENTE usuario.
