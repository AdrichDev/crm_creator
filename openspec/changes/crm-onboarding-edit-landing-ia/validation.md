# Validación — crm-onboarding-edit-landing-ia

Historia: como usuario del creador quiero que "Editar" un proyecto me lleve al onboarding para
añadir/quitar apartados, poder subir un ZIP con la landing del cliente que se inyecte como capa
pública con login al CRM, y que la IA ajuste el branding del CRM en consonancia con la landing.

## Criterios de aceptación (AC)
- **AC1 (Fase 1 — HECHA):** "Editar" navega al onboarding con `?projectId=` y pre-carga la
  config; el onboarding persiste sobre el proyecto existente (no crea uno nuevo). Quitar un
  módulo = ocultarlo (flag false), conservando sus datos.
- **AC2 (UC-3 IA — HECHA, desacoplada):** la IA mapea el contexto del negocio a una propuesta de
  `branding` con previsualización, aplicar y deshacer (reversible). La terminología NO se toca.
- **AC3 (Fase 2/3 — POSPUESTAS):** subir ZIP con landing, servirla como capa pública y su login
  quedan fuera del alcance aprobado.

## Por tarea (Given-When-Then + test)
- **1.1/1.2 editar→onboarding** → Given proyecto existente, When "Editar", Then onboarding en
  modo edición con config pre-cargada, `setConfig` (no crea). Test: front unit.
- **1.3 módulos** → Given quitar módulo, When guardar, Then se oculta (flag false) sin borrar
  datos ni romper nav/permiso. Test: unit.
- **4.2/4.3 IA branding** → Given contexto del negocio, When "generar branding", Then propuesta
  con preview + aplicar + deshacer (reversible). Test: unit.
- **Ingesta ZIP base (HECHA, sin servir)** → Given ZIP, When se valida, Then allowlist ext +
  anti path-traversal (POSIX/Win/UNC) + anti zip-bomb + requiere index.html, fail-closed;
  se almacena en `.landing-store/` fuera de `public/`. Test: 41 tests (front 130 verde).

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-06-25) — PARCIAL (base segura integrada; Fases 2/3 POSPUESTAS por el usuario)
- **HECHO y verde:** Fase 1 (editar → onboarding, UC-1) + UC-3 IA branding ligera
  (desacoplada de la landing) + ingesta segura del ZIP SIN servir nada. `npm test` 67 (y 130
  con los de landing) verde; `tsc` limpio; `next build` OK (/onboarding static). ✓
- **POSPUESTO por decisión de SEGURIDAD del usuario** (vector #1 de `devil-notes.md`: servir
  JS de terceros = robo de sesión): 2.3 sanitizar/servir HTML, 3.1 rutas `app/(landing)/`,
  3.2 login embebido, 4.1 extractor de paleta desde la landing. Requieren capa de servido
  AISLADA (CSP + sandbox/subdominio) + revisión `cybersec:*` + aprobación humana.
- **PENDIENTE (ligado a lo pospuesto):** V.2 e2e completo (ZIP → landing pública con login → IA)
  y V.3 revisión de seguridad de la ingesta/served HTML — sin verificación registrada.
- No regresión garantizada: `landing?` es opcional (`enabled:false`), el CRM actual no cambia.
