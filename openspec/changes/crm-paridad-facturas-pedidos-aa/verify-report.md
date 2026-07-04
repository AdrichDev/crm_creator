# Verification Report — crm-paridad-facturas-pedidos-aa (PR-3 / Fase 2, tasks 2.1-2.3)

**Mode**: OpenSpec, Standard verify (front: vitest + @testing-library; no strict TDD). Scope: PR-3 (documental Facturas UI). UI-only, no back/schema.
**Verdict**: **PASS WITH RISK** — implementation is correct, independently test-proven, and backend is provably untouched. Non-blocking risks: metrics logic now duplicated front/back (no shared module) and an untracked 0-byte junk file sits in the working tree.

## Completeness (Fase 2)
| Task | State | Evidence |
|---|---|---|
| 2.1 Documental facturas list (no manual create) | Done | `front/app/(crm)/facturas/page.tsx` rewritten; list + Ver/Imprimir; no "+ Nueva factura" |
| 2.2 Invoice metrics wired via computeInvoiceMetrics | Done | `front/lib/invoices/metrics.ts` (port); 4 Stats rendered |
| 2.3 Printable preview keeping attached documents | Done | `front/components/facturacion/factura-preview.tsx`; window.print + DocumentosPanel |
| Fase 3 (UI pedidos), Fase 4 (flujo completo) | Not started (correctly `[ ]`) | Out of PR-3 scope |

## Build / Tests evidence (independently re-run)
- `npm test` (front): **436 pass / 0 fail** across **65 test files**. Matches report exactly (baseline 421 + 15 new). Framework confirmed genuine: `package.json` `test` = `vitest run`, deps `@testing-library/react` + `jest-dom`. NOT misreported.
- New tests present and non-vacuous:
  - `tests/facturas-metrics.test.ts` (4): empty→zeros, aggregation **includes Anuladas** in importeTotal (247.5 with a 10 Anulada), free-state no counter, **NaN/Infinity→0** guard.
  - `tests/facturas-documental.test.tsx` (5): metrics render, **asserts NO "Nueva factura"** (`queryByText` null), list + Ver/Imprimir count = rows, Ver/Imprimir opens preview, empty state.
  - `tests/factura-preview.test.tsx` (6): fields render, Imprimir→window.print, Volver→onBack, **pedidoId both branches** (null hides note / present shows note), vista cliente hides cliente.
- `npx tsc --noEmit` (front): exit 0, clean. Confirmed independently.

## Spec compliance matrix
| AC | Requirement | Status | Note |
|---|---|---|---|
| AC1 | Facturas = listado + métricas + estados + doc imprimible como experiencia principal | COMPLIANT (test-proven) | page + preview, covered by documental + preview tests |
| AC2 | Pedidos/presupuestos UI equivalente AA | DEFERRED (Fase 3) | Correctly out of PR-3 |
| AC3 | Numeración por servidor conservada | NOT REGRESSED | PR-3 touches no numbering; operator F00001 path untouched |
| AC4 | Estados coherentes para cálculo + documento | COMPLIANT | same 3 literals in `tone()` + metrics; NaN guard tested |
| AC5 | Endpoints existentes compatibles | COMPLIANT | UI-only, zero endpoint changes |

## Independent findings vs. report claims
1. **No manual-create path** — CONFIRMED. `page.tsx` has no "+ Nueva factura" button, no EntityModal, no create form/route. `useCollection`'s `create` is never invoked; `update` used only for documentos. Only mutation surface is doc add/remove. Test asserts the absence.
2. **Metrics port is behaviorally identical** — CONFIRMED. `front/lib/invoices/metrics.ts` and `back/src/lib/invoices/metrics.ts` are line-for-line equivalent in logic: same `Number.isFinite() ? total : 0` NaN-guard, same totals-include-Anuladas semantics, same exact-literal switch with no-op default. Not a subtly different reimplementation. (The back file's stale comment about "diverging from the front" refers to the OLD inline calc that PR-3 replaced — now moot.)
3. **Preview degrades gracefully on null pedidoId** — CONFIRMED. Origin note gated by `{f.pedidoId && (...)}`; null/undefined → renders nothing, no crash, no misleading "from pedido" text. No line-items table or IVA breakdown fabricated — flat model only (numero/fecha/estado/cliente/servicio/total). Both branches tested.
4. **Backend provably untouched** — CONFIRMED. `git diff --name-only -- back/` is EMPTY. No schema, migration, route, service-operator, or ventas file changed. Diff scope = `page.tsx`, `lib/mock/data.ts` (+`pedidoId?: string|null` on `type Factura`), 2 new source files, 3 new tests.

## PR-3 split assessment (2.1/2.2/2.3 as one PR)
Correct call. Production diff ~371 lines is WITHIN the 400-line review budget; only tests (~210) push the combined figure to ~580. The 400 budget targets reviewer cognitive load, where test code reviews lighter than production. Splitting 2.1/2.2/2.3 has no autonomous slice: metrics with no consumer, or a list whose sole action (Ver/Imprimir) targets a preview component that would not yet exist. The coupling argument is genuine, not scope-hiding. Keep as single PR-3.

## Issues
### CRITICAL
- None. No blocker to archiving PR-3.

### WARNING
1. **Metrics logic duplicated front/back with no shared module.** `computeInvoiceMetrics` exists identically in two packages; any future criteria change (e.g. excluding Anuladas from importeTotal) must edit BOTH or they silently drift. Documented deviation, guarded by tests on both sides, but real maintenance debt. A shared module would de-dupe.

### SUGGESTION
1. **Untracked 0-byte junk file `l├¡mite`** in repo root (created 21:56 during PR-3, broken shell-redirect artifact — the known "ficheros basura heredoc" gotcha). Untracked, NOT committed. Delete before commit; use explicit path adds (not `git add -A`) so it never reaches a commit.
2. **Origin pedido `numero` not surfaced** in preview — deliberate to keep PR UI-only (would need `include: { pedido: true }` on the `/invoices` route). Note says "Generada automáticamente al aceptar un pedido" without the cuid. Acceptable; revisit if humans need the origin number.
3. **Metrics computed client-side over loaded (paginated) invoices only** — pre-existing limitation inherited from the prior inline calc, not introduced by PR-3. If dashboards need global totals, compute server-side later.

## Final Verdict
**PASS WITH RISK for PR-3.** Every headline claim verified independently: 436/436 vitest green, typecheck clean, no manual-create path, metrics port behaviorally identical to back, preview graceful on null pedidoId with no fabricated line-items/IVA, and zero backend files touched. The single-PR decision is the right call given genuine list→metrics→preview coupling and production staying within the 400-line budget. No CRITICAL blockers to archive. Two hygiene/debt items to resolve before/at commit: delete the untracked junk file and track the front/back metrics duplication.

---

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
