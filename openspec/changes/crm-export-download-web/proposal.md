# Proposal — crm-export-download-web

## Intent
Fix the broken project export UX on the deployed web app. Today the export flow
calls a non-existent `/exports/pick-folder` endpoint (stale desktop leftover) and
then prompts the user to paste an absolute Windows path. Since the back runs on
Render (Linux cloud), that path is meaningless and the generated ZIP is never
delivered to the user.

Replace it with a web-native ONE-BUTTON download flow: the native "Save As" dialog
opens on the Export click itself (valid user gesture), capturing a file handle;
the job starts; and when it finishes, the ZIP is written to the already-chosen
handle automatically — no second click. Non-Chromium browsers auto-download via
anchor on completion.

## Scope
- Front only (`creador_CRM/front`).
- Remove `/exports/pick-folder` call + `window.prompt` absolute-path fallback.
- Drop `outputDir` from the front export params and `onExport`/`handleExport`
  signatures. The POST body no longer sends `outputDir` (back defaults it
  server-side).
- On Export click: open `window.showSaveFilePicker` (Chromium) synchronously,
  capture the `FileSystemFileHandle`; cancel (AbortError) aborts the export.
- Hold the handle across the polling wait; on job `done`, fetch the ZIP as an
  authenticated Blob (Bearer + x-business-id) from `GET /api/exports/{jobId}/download`
  and write it to the handle (no new gesture) — or anchor-download if no handle.
- No separate "Descargar" button — download is automatic on completion.
- Add `apiFetchBlob` helper to `lib/api/client.ts`.

## Out of scope
- Back changes. The `GET /api/exports/{id}/download` route (documented in swagger)
  is provided by the back and returns the job's ZIP via `res.download`.

## Risks
- File System Access API types are not in the default DOM lib → declare a minimal
  ambient type to keep typecheck clean.
- User gesture requirement: `showSaveFilePicker` must fire from a click, so the
  download is a button (not auto-download on job completion).
- Multi-format jobs: the single download endpoint returns one ZIP; filename is
  derived from the first available `outputPath` basename.
