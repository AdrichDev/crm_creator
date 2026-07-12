# Tasks: Export hereda legacy-peer-deps

- [x] **T1 — `.npmrc` en las 4 allowlists**
  - `manifest-allowlist.ts`: añadir `'.npmrc'` a WEB/ANDROID/IOS/DESKTOP_ALLOWLIST.
  - **Test**: `allowlistFilter({name:'.npmrc'}, <cada allowlist>)` devuelve la entrada. VERDE.

- [x] **T2 — README con `--legacy-peer-deps`**
  - `web-zip.ts`, `apk.ts`, `exe.ts`, `ipa.ts`: `npm install` → `npm install --legacy-peer-deps`
    (en ipa.ts también `npm install @capacitor/ios --legacy-peer-deps`).
  - **Test**: el README de cada builder contiene `npm install --legacy-peer-deps`. VERDE.

- [x] **T3 — Verificación**
  - `tsc --noEmit` back verde. Suite `manifest-allowlist` + builders verde.
