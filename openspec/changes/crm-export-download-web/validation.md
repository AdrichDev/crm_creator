# Validation — crm-export-download-web

## User story
As a staff user exporting a project package from the web app, I want ONE button:
I click Export, pick where to save (native dialog), the build runs, and the ZIP is
written to my chosen location automatically when it finishes — so I receive the
file with a single action instead of being asked for a meaningless server path.

## Acceptance criteria
- Clicking Export opens the native "Save As" dialog synchronously (valid user
  gesture) and captures a `FileSystemFileHandle`.
- If the user cancels the dialog (AbortError), the export does NOT start.
- After the dialog, the job starts with `{ projectId, formats }` (no folder in the
  body); the handle is held across the polling wait.
- When the job reaches `done`, the ZIP is fetched (Bearer) and written to the held
  handle with no additional gesture.
- Non-Chromium (no `showSaveFilePicker`): the click starts the export with a null
  handle; on `done` the ZIP auto-downloads via anchor.
- There is NO separate "Descargar" button.
- The `/exports/pick-folder` call and `window.prompt` fallback are gone.
- `outputDir` no longer exists in front export params or the POST body.

## Scenarios

### 1. One-button flow starts the export
Given a project with a selected format
When the user clicks "Exportar"
Then `onExport(projectId, formats, handle)` is called (handle is null when
`showSaveFilePicker` is unavailable) and no `/exports/pick-folder` request is made.
Test: `export-job.test.tsx` 2.4 asserts `onExport('p1', ['web-zip'], null)` and no
pick-folder call.

### 2. Auto-download on done
Given a job started via `start()` reaches `status === 'done'`
When the done status is polled
Then the ZIP is fetched from `/exports/{jobId}/download` and delivered (written to
the handle, or anchor-downloaded when no handle).
Test: `export-job.test.tsx` 2.1 asserts `apiFetchBlob('/exports/j1/download')` is
called after done. No "Descargar" button is rendered (2.3).

### 3. Cancel aborts the export
Given `showSaveFilePicker` rejects with `AbortError`
When the user cancels the save dialog
Then the export is not started and no error is surfaced.
Behaviour: `handleExportRow` returns early on `isAbortError`, before `onExport`.
