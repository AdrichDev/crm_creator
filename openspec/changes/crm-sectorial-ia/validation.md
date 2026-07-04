# Validación — crm-sectorial-ia

> Los casos de uso completos (UC-1..UC-9) con sus criterios de aceptación viven en el
> `spec.md` suelto de este change (se conserva tal cual, no se mueve ni borra).

Historia: como generador de CRMs quiero que cada negocio nazca con mocks acordes a su sector,
vinculado a un cliente real de agents-agency, con IA (plan de marketing / estudio de mercado)
como coste de plataforma (sin metering de cliente), panel de Estadísticas idéntico a AA y
tema claro/oscuro.

## Criterios de aceptación (AC) — resumen (detalle en spec.md)
- **AC1 (UC-1..3):** los mocks (clientes, servicios/tarifas, documentos) corresponden al sector;
  `abogados` renombra `servicios` → "Tarifas".
- **AC2 (UC-4/5):** `crm_project(id_crm, id_cliente, …)` persiste el vínculo; el onboarding trae
  un selector de clientes reales (alfabético, top-20 + scroll, filtro) desde AA y auto-rellena Datos.
- **AC3 (UC-6/7):** la IA del CRM genera vía backend de AA (`/ai/marketing-plan`, `/ai/generate`)
  eligiendo modelo/effort; es coste de PLATAFORMA, NO se contabiliza en el ledger del cliente
  (`tokensUsed`/`tokenUsage` solo aplican al chat del agente vía `deductTokens`).
- **AC4 (UC-7):** panel de Estadísticas idéntico a AA como módulo seleccionable.
- **AC5 (UC-8/9):** tema claro/oscuro (system/light/dark) con override manual + arreglo del modo
  claro de AA.
- **AC-éxito:** `npm run test` (Vitest) y `npm run test:e2e` (Playwright) en verde; confirmado que
  una generación IA del CRM NO incrementa `tokensUsed` del cliente en AA (comportamiento esperado).

## Por tarea (Given-When-Then + test)
- **T2 sector-data** → Given vertical, When se genera negocio, Then mocks del sector. Test:
  `sector-data.test.ts`.
- **T4 crm_project** → Given provisión, When se crea negocio, Then `crm_project` con `id_cliente`
  y schema por sector. Test: `tenant-schema.test.ts`.
- **T6 picker** → Given lista de clientes, When se ordena/filtra, Then alfabético top-20 + resto.
  Test: `picker` unit.
- **T12/T14 usage-client** → Given `/api/ai/*` proxy, When se genera, Then reenvía a AA vía
  `AA_SERVICE_TOKEN` (sin clientId, sin metering); errores manejados; uso parseado. Test:
  `usage-client.test.ts` (fetch mock).
- **T17/T19 tema** → Given system/light/dark, When toggle, Then `dataset.theme` correcto. Test:
  `crm-theme.test.ts` + e2e `tema.spec.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-07-04) — Fases 1-5 IMPLEMENTADAS; UC-6.3 resuelto (sin metering)
- Fases 1-5 (sector-data, picker, usage-client, tema, stats, provisión) implementadas; back
  53/0 tras arreglar fragilidad de teardown en auth e2e (guards `if(!backUp||!SB_URL) return`). ✓
- **RESUELTO (decisión Opción A):** la nota previa de bloqueo (ledger de tokens no cableado)
  quedó obsoleta. `/ai/marketing-plan` y `/ai/generate` YA existen en AA
  (`back/src/routes/ai.ts:121-179`), documentados como generación server-to-server SIN metering:
  coste de PLATAFORMA, no descuenta `tokensUsed` del cliente. `deductTokens` sigue aplicando solo
  al chat del agente. spec.md UC-6.3/AC-6.3 actualizado para reflejar el código real.
- **PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO:** `npm run test` + `npm run test:e2e` en verde
  (lo ejecuta el usuario). La verificación de metering ya no aplica (comportamiento esperado es
  NO descontar cupo).
