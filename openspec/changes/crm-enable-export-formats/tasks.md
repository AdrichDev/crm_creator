# Tasks: Enable all four export formats

- [x] 1. Back: `VALID_FORMATS` = `["web-zip", "apk", "exe", "ipa"]` in exports.ts.
- [x] 2. Back: confirm `defaultBuilders` wires web-zip, ipa, exe, apk in export-job-manager.ts.
- [x] 3. Front: expose four formats with Spanish labels in export-table.tsx
      (web-zip → "Web (código fuente)", apk → "Android (APK)", exe → "Windows (.exe)",
      ipa → "iOS (.ipa)"); keep one-click export + native save-dialog flow intact.
- [x] 4. Back: iOS README (ipa.ts `renderReadme`) documents macOS-only flow incl.
      `npm install @capacitor/ios` and `npx cap add ios`; add top note.
- [x] 5. Verify `front/android/**`, `front/electron/**`, `front/capacitor.config.ts`
      are git-tracked (cloud back copies front/ at export time).
- [x] 6. Tests: add 202-multi-format and 400-invalid-format cases to exports-routes.test.ts.

## Final verifications
- [ ] back: `npx tsc --noEmit` clean.
- [ ] back: exports-routes + export-builders tests green.
- [ ] front: `npx tsc --noEmit` clean + `vitest run tests/export-job.test.tsx` green.
