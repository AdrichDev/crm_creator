# Tasks: Onboarding guardado por paso

Orden crítico: refactor sin regresión (1) → guardado por-paso (2) → stepper (3) → verify (4).

- [x] **T1 — Refactor `buildConfig()` + `persist()` (sin cambio de comportamiento)**
  - Extraer construcción de `cfg` a `buildConfig()`.
  - Extraer `persist(cfg): Promise<boolean>` (updateProject + openProject +
    syncHorarioConAviso, sin navegación).
  - `finish()` edición: `if (await persist(buildConfig())) router.push('/dashboard')`.
  - Rama de alta intacta.
  - **Test**: finish en edición sigue llamando `updateProject` con config completa y
    navegando. VERDE.

- [x] **T2 — Botón "Guardar" por paso (solo edición)**
  - Estado `saveState` + `saveStep()` + `useEffect` de reset en `[draft, step]`.
  - Botón `variant="ghost"` en footer, visible solo si `isEdit`, label por `saveState`.
  - **Test**: `saveStep` invoca `updateProject`; `router.push` NO llamado. VERDE.

- [x] **T3 — Gating alta + Stepper clicable**
  - Confirmar que en alta (sin `projectId`) no se renderiza el botón "Guardar" por paso.
  - Stepper: círculos clicables (`setStep(i)`) solo en edición.
  - **Test**: alta → sin botón "Guardar"; edición → click en círculo cambia paso. VERDE.

- [x] **T5 — "Otras variables" duplicado en paso "BD, API y Keys"**
  - Causa: la sección freeform se renderiza en TODA instancia de `TenantKeysPanel`
    sin importar `groups`; el paso monta 2 paneles (database + ai/maps) → aparecía 2×.
  - Fix: prop `showExtras` (default true) en `TenantKeysPanel`; `showExtras={false}`
    en la instancia `database` → "Otras variables" queda solo bajo API Keys.
  - **Test**: `showExtras=false` oculta la sección; default la muestra. VERDE (17/17).

- [x] **T4 — Verificación final**
  - `tsc --noEmit` verde.
  - Suite front (vitest) verde, incluidos los nuevos tests.
  - `/sdd-verify` o `/code-review` antes de commit.
  - Smoke visual opcional (login verify-agent, editar negocio, guardar en paso Marca).
