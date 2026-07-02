# Validación — crm-sectorial-ia

> Los casos de uso completos (UC-1..UC-9) con sus criterios de aceptación viven en el
> `spec.md` suelto de este change (se conserva tal cual, no se mueve ni borra).

Historia: como generador de CRMs quiero que cada negocio nazca con mocks acordes a su sector,
vinculado a un cliente real de agents-agency, con IA (plan de marketing / estudio de mercado)
que contabilice tokens en el mismo ledger del cliente, panel de Estadísticas idéntico a AA y
tema claro/oscuro.

## Criterios de aceptación (AC) — resumen (detalle en spec.md)
- **AC1 (UC-1..3):** los mocks (clientes, servicios/tarifas, documentos) corresponden al sector;
  `abogados` renombra `servicios` → "Tarifas".
- **AC2 (UC-4/5):** `crm_project(id_crm, id_cliente, …)` persiste el vínculo; el onboarding trae
  un selector de clientes reales (alfabético, top-20 + scroll, filtro) desde AA y auto-rellena Datos.
- **AC3 (UC-6/7):** la IA del CRM genera vía backend de AA eligiendo modelo/effort, y el consumo
  se contabiliza en el ledger del cliente (`tokensUsed` + `tokenUsage`).
- **AC4 (UC-7):** panel de Estadísticas idéntico a AA como módulo seleccionable.
- **AC5 (UC-8/9):** tema claro/oscuro (system/light/dark) con override manual + arreglo del modo
  claro de AA.
- **AC-éxito:** `npm run test` (Vitest) y `npm run test:e2e` (Playwright) en verde; una
  generación IA del CRM incrementa `tokensUsed` del cliente en AA.

## Por tarea (Given-When-Then + test)
- **T2 sector-data** → Given vertical, When se genera negocio, Then mocks del sector. Test:
  `sector-data.test.ts`.
- **T4 crm_project** → Given provisión, When se crea negocio, Then `crm_project` con `id_cliente`
  y schema por sector. Test: `tenant-schema.test.ts`.
- **T6 picker** → Given lista de clientes, When se ordena/filtra, Then alfabético top-20 + resto.
  Test: `picker` unit.
- **T12/T14 usage-client** → Given `/api/ai/*` proxy, When se genera, Then reenvía a AA con
  clientId; 402 manejado; uso parseado. Test: `usage-client.test.ts` (fetch mock).
- **T17/T19 tema** → Given system/light/dark, When toggle, Then `dataset.theme` correcto. Test:
  `crm-theme.test.ts` + e2e `tema.spec.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-06-25) — Fases 1-5 IMPLEMENTADAS; verificación final BLOQUEADA en AA
- Fases 1-5 (sector-data, picker, usage-client, tema, stats, provisión) implementadas; back
  53/0 tras arreglar fragilidad de teardown en auth e2e (guards `if(!backUp||!SB_URL) return`). ✓
- **BLOQUEADO / POSPUESTO (tarea b — ledger de tokens):** el incremento de `tokensUsed`
  (`aa.tenant`) al generar un CRM NO está cableado end-to-end. El lado CRM está OK
  (usage-client → `/api/ai/generate` → aaFetch con clientId), pero en agents-agency NO
  contabiliza: `deductTokens` solo lo llama el chat del agente; `/api/ai/marketing-plan` y
  `/api/ai/generate` NO existen en AA; `market-study` no llama `deductTokens` y `MarketStudy`
  no tiene `tenantId`. → FIX en AA (repo aparte): crear esos endpoints + llamar `deductTokens`
  (firma exige agentId+conversationId) + CORS/`AA_SERVICE_TOKEN`. Ligado al proxy AA roto (JWKS).
- **PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO:** `npm run test` + `npm run test:e2e` en verde
  (lo ejecuta el usuario) y comprobar en agents-agency que una generación del CRM incrementa
  `tokensUsed` del cliente — sin verificación registrada (unit tests mockean deps por DI).
