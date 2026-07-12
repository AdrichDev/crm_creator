# Validation: Export hereda legacy-peer-deps

## User Story
Como usuario que compila un CRM exportado, quiero que `npm install` funcione sin
argumentos extra, para que el build no rompa por el conflicto React 19 ↔ emoji-mart.

## Acceptance Criteria
- **AC1** — `.npmrc` pasa el `allowlistFilter` en los 4 formatos (web/android/ios/desktop)
  → viaja en el ZIP del artefacto.
- **AC2** — Los README generados por los 4 builders instruyen `npm install --legacy-peer-deps`.

## Scenarios (Given-When-Then)

### S1 — .npmrc viaja al artefacto (AC1)
- **Given** un `front/.npmrc` con `legacy-peer-deps=true`
- **When** se ensambla el ZIP de cualquier formato con `allowlistFilter`
- **Then** la entrada `.npmrc` no se descarta (el filtro devuelve la entrada, no `false`)

### S2 — README con el flag (AC2)
- **Given** el README generado por `web-zip`/`apk`/`exe`/`ipa`
- **When** se lee el paso de instalación de dependencias
- **Then** aparece `npm install --legacy-peer-deps`

## Tests
- **T1** — `allowlistFilter({name:'.npmrc'}, ALLOWLIST)` ≠ `false` para las 4 allowlists.
- **T2** — el string del README de cada builder contiene `npm install --legacy-peer-deps`.

## Done
Cada tarea DONE solo con su test verde.
