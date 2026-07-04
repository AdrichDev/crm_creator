# Verification Report — crm-paridad-facturas-pedidos-aa (PR-2 / task 1.2)

**Mode**: OpenSpec, Standard verify (node:test, no strict TDD). Scope: PR-2 only (Pedido/PedidoLine model + `/pedidos` route). PR-2b deliberately deferred.
**Verdict**: **PASS WITH RISK** — implementation is correct by inspection and CI is green, but the new route has zero runtime-executed test coverage in `npm test`.

## Completeness (task 1.2)
| Item | State |
|---|---|
| `Pedido` + `PedidoLine` Prisma models | Present, additive |
| Migration `20260704010000_pedido` | Written, NOT applied (by convention) |
| `computePedidoTotals` pure fn + unit tests | Present, 5 tests, run in CI |
| `/pedidos` route (GET list/detail, POST, PUT status) | Present, staff-gated |
| e2e contract tests | Present (4), excluded from `npm test` |
| `ventas` / `service-operator` untouched | Confirmed via git diff |

## Build / Tests evidence
- `npm test` re-run independently: **390 pass / 0 fail / 0 skipped** (suites 120). Matches report's claimed count.
- Baseline 385 → 390 = **+5 tests, all in `src/lib/pedidos/__tests__/totals.test.ts`** (pure totals only).
- Test glob `src/**/!(*.e2e).test.ts` excludes `pedidos.e2e.test.ts` (4 tests). Those e2e tests — which cover tenant-scoping 404 and server-side totals — require live back + applied migration and did NOT run.

## Tenant scoping / cross-tenant leak (code inspection)
No leak. `req.businessId` is set by `auth.ts` from membership. Every query is scoped:
- GET `/` → `where: { businessId, eliminadoEn: null }`
- GET `/:id` → `findFirst({ id, businessId, eliminadoEn: null })` → other business's id returns 404
- POST `/` → creates with `businessId: req.businessId!`; `customerId` validated to belong to same business (cross-tenant guard)
- PUT `/:id/status` → `findFirst({ id, businessId })` then update by `existing.id` → no cross-tenant mutation
Business A cannot read or mutate Business B's pedido by guessing an ID.

## Migration additivity / conventions
- Only CREATE TABLE (crm.pedido, crm.linea_pedido), CREATE INDEX, ADD CONSTRAINT (FKs on new tables), ENABLE RLS + CREATE POLICY on the NEW tables. Zero ALTER/DROP on `crm.factura`, `crm.venta`, or any existing table. Genuinely additive.
- RLS policy matches the established `comercial_campo` convention exactly (schema-qualified `crm.membresia`, `crm."MemberRole"` cast, `rol <> 'CLIENT'`). `linea_pedido` (no negocio_id) authorizes via parent pedido subquery — correct adaptation.
- FKs coherent: pedido→negocio CASCADE, pedido→cliente SET NULL (matches optional relation), linea→pedido CASCADE.

## PR-2 / PR-2b split assessment
Sound engineering call, not hiding scope. PR-2 is a purely additive, isolated, reversible slice (new tables + new route). PR-2b defers: (1) `pedido_id @unique` column on the SHARED, live `crm.factura` table (operator-bot writes it), (2) retiring the live `POST /api/invoices` surface, (3) cross-entity accept→invoice transaction. Those are materially higher risk and combining would exceed the 400-line review budget. Deferred work is fully documented in tasks.md 1.2b, design.md, and apply-progress. PR-2 stands alone as a coherent, independently-verifiable unit.

## Issues
### CRITICAL
- None.

### WARNING
1. **Route has no runtime-executed test coverage in CI.** The 4 e2e tests covering tenant-scoping (404 cross-business) and server-side totals are gated on live infra + applied migration; they did NOT run. Tenant isolation is verified by inspection only. Per SDD "scenario compliant only when a covering test passed at runtime", this scenario is inspection-verified, not runtime-proven. Recommend running `npm run test:e2e` against live infra after the migration is applied, before merge.
2. **Migration not applied** — the `/pedidos` route will 500 (missing relation) until a human runs migrate deploy. Accepted PR-1 convention, but must be tracked so the route is not shipped dormant.

### SUGGESTION
1. PUT `/:id/status` allows any→any estado transition (no state-machine guard), including from terminal states (rechazada/caducada → aceptada). Benign in PR-2 (no side effect) but should gain transition validation in PR-2b before accept triggers invoice creation.
2. No `@@unique([businessId, numero])` on Pedido — duplicate document numbers are possible. Consistent with existing `factura`/invoice convention (numero passed as-is), so acceptable, but worth revisiting for documental integrity.

## Final Verdict
**PASS WITH RISK for PR-2.** Report's headline claims (390/390, additive, ventas/service-operator untouched, tenant scoping) all verified independently and hold true. The one caveat the report understated: the +5 CI tests are pure-function only; the route's HTTP/tenant behavior is proven by inspection, not by executed tests. No CRITICAL blockers to archive of PR-2; the route must not be treated as production-live until (a) migration applied and (b) e2e suite run green.
