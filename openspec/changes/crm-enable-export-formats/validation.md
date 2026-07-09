# Validation: Enable all four export formats

## User story
As a staff user of the CRM dashboard, I want to export a project as Web, Android
(APK), Windows (.exe) or iOS (.ipa) so I can deliver the generated app on any
target platform.

## Acceptance criteria
- AC1: The four formats (web-zip, apk, exe, ipa) are accepted by `POST /api/exports`.
- AC2: An unknown format is rejected with `400 invalid_format`.
- AC3: The dashboard selector offers the four formats with clear Spanish labels.
- AC4: The iOS README documents the macOS-only build flow including `npx cap add ios`.

## Scenarios (Given-When-Then)

### Scenario 1: selecting a native format starts a job
- Given a valid project and membership
- When `POST /api/exports` is called with `formats: ['apk', 'exe', 'ipa']`
- Then the response is `202 { jobId }`
- Test: exports-routes.test.ts → "202 con los cuatro formatos nativos (apk, exe, ipa)"

### Scenario 2: unknown format still rejected
- Given a valid project
- When `POST /api/exports` is called with `formats: ['foo']`
- Then the response is `400` with error code `invalid_format`
- Test: exports-routes.test.ts → "400 invalid_format si el formato es desconocido"

### Scenario 3: iOS README is Mac-complete
- Given an iOS export ZIP
- When the user opens README.md
- Then it lists, in order: `npm install`, `npm install @capacitor/ios`,
  `npm run build`, `npx cap add ios`, `npx cap sync ios`, `npx cap open ios`
  with a top note "iOS solo se compila en macOS con Xcode (requisito de Apple)."
- Test: manual inspection of `renderReadme` in ipa.ts (builder ships stub test).
