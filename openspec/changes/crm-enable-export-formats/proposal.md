# Proposal: Enable all four export formats (web-zip, apk, exe, ipa)

## Intent
The project exporter already ships builders for web-zip, apk, exe and ipa, but the
HTTP contract only whitelisted `web-zip`. Enable the remaining three so users can
export Android (APK), Windows (.exe) and iOS (.ipa) source packages from the
dashboard.

## Scope
- `back/src/routes/exports.ts`: `VALID_FORMATS` accepts the four formats.
- `back/src/lib/export-job-manager.ts`: confirm all four builders are wired in
  `defaultBuilders` (web-zip, ipa, exe, apk).
- `front/components/dashboard/export-table.tsx`: expose the four formats with clear
  Spanish labels in the per-project selector.
- `back/src/lib/export-builders/ipa.ts`: README updated for the macOS-only flow.

## Cloud-safety
Builders only SCAFFOLD source + native project config and ZIP it; they do NOT
compile on the server. Enabling is safe in the cloud back.

## Committed scaffolding (required at runtime)
The cloud back copies `front/` at export time, so the native projects MUST be
git-tracked:
- `front/android/**` — tracked (APK Capacitor project).
- `front/electron/**` — tracked (`main.cjs`, `preload.cjs`, `static-server.cjs`).
- `front/capacitor.config.ts` — tracked.
- `front/ios/**` — intentionally NOT committed and CANNOT be scaffolded on
  Windows/cloud. The iOS ZIP ships source + README only.

## iOS constraint
iOS compiles only on macOS with Xcode (Apple requirement). The exported iOS ZIP
contains the source; the README instructs the Mac user to run
`npm install @capacitor/ios`, `npx cap add ios` (creates the Xcode project),
`npx cap sync ios` and `npx cap open ios`.

## Risks / Dependencies
- `@capacitor/ios` is NOT a project dependency and is NOT added here (would break
  on Windows). The Mac user installs it per the README.
- No new server dependencies.
