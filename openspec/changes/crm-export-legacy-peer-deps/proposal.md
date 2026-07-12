# Proposal: Export hereda legacy-peer-deps (build del artefacto no rompe)

## Intent
Reporte del usuario (12/07/2026): al hacer `npm install` en el CRM exportado, el build
rompe por conflicto de peer deps entre React 19 y la librería de emojis
(`@emoji-mart/react@^1.1.1`, cuyo peerDep es React ≤18). El workaround manual es
`npm install --legacy-peer-deps`.

Causa raíz: `front/.npmrc` YA tiene `legacy-peer-deps=true` (por eso el build del CRM de
plataforma funciona), pero **`.npmrc` no está en ninguna de las 4 allowlists de export**
(`manifest-allowlist.ts:33-120`), así que no viaja en el ZIP del artefacto. El usuario
final hace `cd app && npm install` sin ese `.npmrc` → npm aborta por el conflicto.
Además, los README generados (`web-zip/apk/exe/ipa`) instruyen `npm install` pelado.

## Scope
1. Añadir `'.npmrc'` a las 4 allowlists (`WEB_ALLOWLIST`, `ANDROID_ALLOWLIST`,
   `IOS_ALLOWLIST`, `DESKTOP_ALLOWLIST`) → el `.npmrc` con `legacy-peer-deps=true` viaja
   en el ZIP → `npm install` funciona sin flag manual.
2. Refuerzo visible: en los README de los 4 builders, cambiar `npm install` →
   `npm install --legacy-peer-deps` (y en ipa.ts también `npm install @capacitor/ios`),
   para que el comando copiado del README funcione aunque el `.npmrc` no se respetara.

## Out of Scope
- Actualizar/reemplazar `emoji-mart` por una versión compatible con React 19 (no existe
  release oficial con React 19 a día de hoy). `legacy-peer-deps` es el puente estándar,
  ya adoptado por el front de plataforma.

## Risks
- `legacy-peer-deps` silencia TODOS los conflictos de peer deps, no solo el de emojis.
  Aceptado: es la misma política que ya usa el front de plataforma (`front/.npmrc`); el
  export solo la propaga, no introduce nueva política.
