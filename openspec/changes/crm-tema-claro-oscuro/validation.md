# Validación — crm-tema-claro-oscuro

Historia: como usuario quiero un interruptor de tema simple (claro/oscuro) que funcione y persista, sin la opción "Sistema" que no funcionaba.

## Criterios de aceptación
- **AC1**: El toggle solo ofrece claro y oscuro. No existe "Sistema".
- **AC2**: Cambiar el tema persiste y sobrevive a un reload.
- **AC3**: Una preferencia `system` guardada de antes se normaliza a `dark` sin error.
- **AC4**: `tsc` limpio, tests front verdes.

## Por tarea (Given-When-Then)
### T1 — crm-theme.ts
- **Given** localStorage sin preferencia, **When** `loadMode()`, **Then** devuelve `dark`. _Test._
- **Given** localStorage = `'system'` (legado), **When** `loadMode()`, **Then** devuelve `dark`. _Test._
- **Given** modo `light`, **When** `applyMode`, **Then** `documentElement.dataset.theme === 'light'`. _Test._

### T2 — theme-toggle
- **Given** tema `dark`, **When** clic en toggle, **Then** pasa a `light` y persiste. _Test/manual._

### T3 — initTheme
- **Given** initTheme ejecutado, **When** cambia `prefers-color-scheme` del SO, **Then** el tema NO cambia (ya no se sigue al SO). _Test/manual._
