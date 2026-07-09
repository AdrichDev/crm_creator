# Tasks — crm-export-download-web

- [x] Add `apiFetchBlob(path)` to `lib/api/client.ts` (Bearer + x-business-id,
      returns `res.blob()`, throws `ApiError` on !ok).
- [x] `lib/export/download.ts`: `openSaveDialog(filename)` (picker → handle | null,
      throws AbortError on cancel), `downloadExportZip(jobId, filename, handle?)`
      (write to handle, else anchor), `toSlug`, `filenameFromOutputPath`, and
      minimal File System Access API ambient types.
- [x] Drop `outputDir` from `StartExportParams` (`lib/export/types.ts`).
- [x] `use-export-job.ts`: `start(params, handle?)` holds the handle in a ref keyed
      by jobId; on poll `done`, auto-fires `downloadExportZip`; exposes
      `downloading` + `downloadError`. Only start()-initiated jobs auto-download
      (resume() does not, to avoid downloading on page reload).
- [x] `export-table.tsx`: on Export click, `openSaveDialog` (cancel → return);
      `onExport(projectId, formats, handle)`.
- [x] `dashboard-tabs.tsx`: `handleExport(projectId, formats, handle)` →
      `startExport({ projectId, formats }, handle)`.
- [x] `export-header-progress.tsx`: NO "Descargar" button; shows "Descargando ZIP…"
      + `downloadError`. Progress UI kept.
- [x] `export-job-context.tsx`: propagate `downloading` / `downloadError` and the
      `start(params, handle?)` signature.
- [x] `export-job.test.tsx`: 2.1 asserts auto-download on done; 2.3 asserts NO
      Descargar button; 2.4 asserts `onExport('p1', ['web-zip'], null)`.
- [x] `npx tsc --noEmit` → 0 errors.
- [x] `npx vitest run tests/export-job.test.tsx` → 4/4 green.

## Final verification
- One-button flow: Export click → native dialog (handle) → job start → auto-write
  on done; non-Chromium → anchor auto-download.
- No `outputDir`, no `pick-folder`, no `window.prompt`, no manual download button.
