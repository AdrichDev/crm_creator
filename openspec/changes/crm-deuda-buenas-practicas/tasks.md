# Tasks — crm-deuda-buenas-practicas

## ESTADO: PROPUESTA — sin iniciar (pendiente de priorización del usuario)

## Lote A — Validación unificada (bajo riesgo)
- [ ] A.1 Middleware `validateBody(schema)` en lib (Zod, 422 con shape único `{error:{code,message,details}}`).
- [ ] A.2 Migrar users/categories/packages/timeoff/sale-lines/auth/exports al middleware.
- [ ] A.3 categories.ts: sustituir casts manuales por schema Zod.

## Lote B — Composición
- [ ] B.1 customers.ts: extraer segmentoDe/buildData/resolveGeo a `lib/customers/helpers.ts` (puros, testeables).
- [ ] B.2 users-panel.tsx: partir en Panel + NewUserModal + EditUserModal.

## Lote C — Convención y robustez
- [ ] C.1 ARQUITECTURA.md: regla de naming formal (tipos/enums/FK inglés; campos de negocio y labels castellano).
- [ ] C.2 auth.ts:197 resetPasswordForEmail: logging + reintento suave (o justificar el fire-and-forget).

## Lote E — Tests e2e: auth compartida (diagnosticado 2026-07-02)
- [ ] E.1 Migrar los 10 `*.e2e.test.ts` a `_shared.e2e.ts` (ya creado): api() común, auth
  cacheada por archivo, retry-backoff ante "rate limit" de Supabase (si agota → skip explícito,
  no fallo). Causa: cada archivo duplica registerAndToken → ráfaga de register/signIn reales →
  "Request rate limit reached" → falsos negativos en cascada al correr la suite en paralelo.
  Mitigación mientras tanto: correr la suite en vivo con `--test-concurrency=1`.

## Lote D — Decisiones
- [ ] D.1 SupabaseLandingStore: implementar o marcar oficialmente no-soportado.
- [ ] D.2 Auditar adopción de use-paginated-api en páginas front.

Regla: cada lote con suite completa verde antes y después; sin mezclar lotes por commit.
