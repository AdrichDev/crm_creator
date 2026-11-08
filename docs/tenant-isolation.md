# Tenant isolation

Every row of a tenant table belongs to exactly one `Business`. This API isolates businesses in
**application code** — row filters written by hand plus a structural Prisma guard that fails
closed — not with Postgres Row Level Security. RLS is enabled on some tables, but the API connects
as the table owner and therefore never evaluates those policies.

**Read this first:** the isolation guarantee is `back/src/lib/tenant-scope.ts` (the guard) plus the
filters it validates. RLS is *not* part of that path (see [Database posture](#database-posture-rls-and-grants)).

| Question | Short answer |
|---|---|
| Where is the tenant key? | `businessId` on 32 models; 1 nullable (`OAuthCredential`); 9 child tables inherit it from their parent; 4 models are global |
| Who sets it? | `authenticate` (`x-business-id` → membership, fallback: first membership), the tenant API key lane, or the public payload `businessId` |
| What enforces it? | Hand-written `businessId` filters + the Prisma guard (throws `TenantScopeError` → 500) + the FK gate (`assertFks`) + the leak suite |
| What bypasses it? | Only `runUnscoped(reason, fn)` — 16 call sites, listed below |
| Database | API connects as the schema owner → RLS bypassed; `FORCE ROW LEVEL SECURITY` would break the API |

---

## Where `businessId` lives

Source of truth: `back/src/lib/tenant-scope.ts` (hand-written classification of the 46 models in
`back/prisma/schema.prisma`, mirrored by a self-check test — see [Adding a new model](#adding-a-new-model)).
The column is `businessId` in Prisma, `negocio_id` in Postgres.

**32 tenant models** (own mandatory `businessId`):

| Area | Models |
|---|---|
| People & access | `Customer`, `Employee`, `Membership`, `Team` |
| Catalog | `Location`, `Service`, `Product`, `Resource`, `Package`, `Tag`, `Campaign` |
| Bookings | `Booking`, `CustomerPackage` |
| Sales & billing | `Sale`, `Invoice`, `Pedido`, `ExportVersion` |
| Field sales & messaging | `Contacto`, `Visit`, `VisitState`, `CustomerNote`, `Reminder`, `WorkdayEvent`, `Notification`, `TelegramMessage`, `Document` |
| Work time | `Fichaje`, `TimeOffRequest` |
| Per-tenant settings & platform rows | `BusinessSetting`, `TenantApiKey`, `TenantSecret`, `TenantStateEvent` |

**1 nullable tenant model:** `OAuthCredential` — `businessId` may be `null` (platform credential),
but it must be *explicitly* present in every `where`/`data`.

**9 child models** (no `businessId` of their own; the parent relation carries the business):

| Child | Parent relation | FK required on create |
|---|---|---|
| `OpeningHour` | `location` | `locationId` |
| `Holiday` | `location` | `locationId` |
| `EmployeeSchedule` | `employee` | `employeeId` |
| `BookingStatusHistory` | `booking` | `bookingId` |
| `PackageSession` | `customerPackage` | `customerPackageId` |
| `SaleLine` | `sale` | `saleId` |
| `InvoiceLine` | `invoice` | `invoiceId` |
| `PedidoLine` | `pedido` | `pedidoId` |
| `TeamMember` | `team` | `teamId` |

**4 exempt models** (not tenant rows, never validated): `Business` (the tenant root itself),
`User`, `PlatformSetting`, `CalendarToken`.

A model that is in none of these lists makes the guard **fail closed** (`'modelo sin clasificar en
la guarda de tenancy'`), and the self-check test in `back/src/lib/__tests__/tenant-scope.test.ts`
(`todo modelo del cliente generado está clasificado en exactamente un conjunto`) fails first.

---

## Who sets the active business

| Lane | File | Behaviour |
|---|---|---|
| Panel session | `back/src/middleware/auth.ts` | Verifies the Supabase `Bearer` token (ES256 via JWKS), loads **all** the user's memberships inside `runUnscoped`, then resolves `x-business-id`: a value that matches a membership wins, otherwise the header is rejected with `403 wrong_business`; **no header** falls back to the first membership. Sets `req.userId`, `req.businessId`, `req.role`. `GET /projects` is exempt from the `wrong_business` 403 (stale header must not block the project selector). |
| Tenant API key (exported apps) | `back/src/middleware/tenant-api-key.ts` | `Bearer tk_…` → SHA-256 hash lookup inside `runUnscoped` → sets `req.tenantBusinessId`. Unknown/revoked key → `401 invalid_api_key`. |
| Public (no auth) | `back/src/routes/public/index.ts` | `businessId` comes from the request payload (body or query, `cuid()` shape only) and is copied to `req.tenantBusinessId`; the handlers pass that explicit `businessId` into every query. |
| Lifecycle gate | `back/src/middleware/tenant-gate.ts` | Reads `req.tenantBusinessId ?? req.businessId`. No identity → no-op. `SUSPENDED`/expired `GRACE` → `423 tenant_suspended`; `TERMINATED` → `410 tenant_terminated`. |

`req.businessId` (panel session) and `req.tenantBusinessId` (API key / public lane) never mix:
`authenticate` never writes `tenantBusinessId` (`back/src/middleware/types.ts`).

---

## What guarantees isolation

Four layers, all in application code.

### 1. Hand-written filters

Every panel route filters by the active business. The generic CRUD factory is the pattern:
`back/src/lib/crud.ts` builds `where: { businessId: req.businessId, eliminadoEn: null }` for lists,
`{ id, businessId }` for reads/updates/deletes, and injects `businessId` on create. Hand-written
routers follow the same shape (e.g. `back/src/routes/bookings.ts`, `back/src/routes/exports.ts`).

Foreign keys coming from a request body are checked against the active business by
`assertFks` / `assertBelongsToBusiness` in `back/src/lib/tenant.ts` → `422 cross_tenant`.

### 2. The structural guard

`back/src/lib/tenant-scope.ts` implements a Prisma `$allModels.$allOperations` extension, installed
on the singleton (and therefore on `tx`) in `back/src/prisma.ts`. It validates each call **before**
it reaches the database:

| Model class | `where` rules (find*, update*, delete*, count, aggregate, groupBy, upsert) | `data` rules (create, createMany, createManyAndReturn, upsert-create) |
|---|---|---|
| Tenant (32) | `businessId` at the top level or inside a top-level `AND`, as a non-empty string or `{ equals: '…' }` | `businessId`, or `business: { connect: { id } }` |
| `OAuthCredential` | same, and an explicit `null` is accepted (`{ equals: null }` too) | same, explicit `null` accepted |
| Child (9) | filter through the parent relation: `{ sale: { businessId } }` or `{ sale: { is: { businessId } } }`, at top level or inside a top-level `AND` | the parent FK (`saleId`), or `<relation>: { connect: { id } }` |
| Exempt (4) | not validated | not validated |

Shapes that deliberately **do not** count as a business filter (pinned by tests): `businessId` nested
inside a relation, inside `OR`, inside `NOT`; `undefined`; `''`; `{ in: [...] }`; `{ not: … }`; an
empty `AND`. In a child table, ownership of the *parent* row itself is still the route's job
(`assertFks`), exactly as before.

### 3. Error mapping

A `TenantScopeError` is a programming bug, not a user error: `back/src/middleware/error.ts` logs
`model.operation` server-side and answers `500 { error: { code: 'internal', message: 'Error interno' } }`.
No model name, operation, or SQL value ever reaches the client.

### 4. `runUnscoped`: the 16 explicit exits

`runUnscoped(reason, fn)` (AsyncLocalStorage, reason mandatory and non-blank) is the **only** way to
run a tenant query without a business filter. `grep -rn "runUnscoped(" back/src --include=*.ts`
(excluding tests) returns exactly these 16 call sites:

| # | Call site | Reason (quoted from the source) |
|---|---|---|
| 1 | `back/src/middleware/auth.ts` (line 32) | `authenticate: resolver las membresías del usuario antes de fijar el negocio activo` |
| 2 | `back/src/middleware/tenant-api-key.ts` (line 72) | `tenant API key: resolver el negocio a partir del hash del token portador` |
| 3 | `back/src/routes/auth.ts` (line 114) | `GET /auth/me: membresías del propio usuario para el selector de negocio (aún sin negocio activo)` |
| 4 | `back/src/routes/calendar.ts` (line 73) | `calendar feed ICS: agenda del dueño del token, acotada por usuario y no por negocio (Employee.userId es único)` |
| 5 | `back/src/routes/calendar.ts` (line 95) | `calendar feed ICS: recordatorios del dueño del token, acotados por usuario y no por negocio` |
| 6 | `back/src/routes/calendar.ts` (line 134) | `calendar feed ICS: resolver el negocio del dueño del token (Employee.userId o su primera membresía)` |
| 7 | `back/src/routes/exports.ts` (line 597) | `GET /exports/versions: negocios del usuario para acotar el historial de versiones` |
| 8 | `back/src/routes/exports.ts` (line 655) | `GET /exports/versions/:id/download: leer la versión por id y autorizarla después con la membresía` |
| 9 | `back/src/routes/projects.ts` (line 60) | `GET /projects: negocios del usuario para el selector de proyecto (aún sin negocio activo)` |
| 10 | `back/src/routes/service-operator.ts` (line 575) | `operador (service token): opera sobre cualquier negocio por diseño` |
| 11 | `back/src/routes/users.ts` (line 196) | `DELETE /users: contar las membresías del usuario en otros negocios antes de borrar la cuenta huérfana` |
| 12 | `back/src/lib/calendarSync.ts` (line 313) | `calendarSync: credenciales de Google Calendar conectadas de todos los negocios` |
| 13 | `back/src/lib/comercial/admin-employee.ts` (line 91) | `admin-employee: comprobar si el usuario ya está vinculado a un empleado de cualquier negocio (Employee.userId es único global)` |
| 14 | `back/src/lib/digestScheduler.ts` (line 393) | `digestScheduler: marcar como enviado el digest por id (fila creada/listada en esta pasada)` |
| 15 | `back/src/lib/reminderDrainer.ts` (line 201) | `reminderDrainer: leer la reserva de un recordatorio ya reclamado (el negocio viene de la fila reclamada)` |
| 16 | `back/src/lib/reminderDrainer.ts` (line 207) | `reminderDrainer: cerrar la notificación reclamada por id (el negocio viene de la fila reclamada)` |

**Gotcha when writing one:** Prisma queries are lazy (`PrismaPromise`). The callback must `await`
the query *inside* the wrap (`runUnscoped('…', async () => await prisma.x.findMany(…))`);
returning the promise unawaited resolves it outside the context and the guard fires again. Pinned by
`back/src/lib/__tests__/tenant-scope-transaction.test.ts`.

Two former escapes became plain `{ id, businessId }` updates and no longer need `runUnscoped`
(`back/src/lib/__tests__/tenant-scope-narrow-wraps.test.ts`).

---

## Explicit escapes and separate auth lanes

| Surface | File | Why it is outside the panel-tenant lane |
|---|---|---|
| Operator router `/service/operator` | `back/src/routes/service-operator.ts`, mounted in `back/src/server.ts` | Protected by the static service token (`back/src/middleware/operator-token.ts`, `x-service-token`), not by a user session; the whole router runs inside `runUnscoped` because it operates on any business by design. |
| Background crons | `back/src/lib/reminderDrainer.ts`, `back/src/lib/digestScheduler.ts`, `back/src/lib/calendarSync.ts` (started in `back/src/server.ts`, kill switch `ENABLE_CRONS=false`) | They sweep every business. Each DB read/write without a known business is one of the 16 wraps above; the ones that do know the business filter by `{ id, businessId }`. `back/src/lib/export-retention.ts` is filesystem-only. |
| Public API `/api/public/*` | `back/src/routes/public/index.ts` | No session: the business is the `businessId` in the payload (cuid-shaped), so queries carry an explicit `businessId` and the guard passes without an escape. |
| License heartbeat `/license/heartbeat` | `back/src/routes/license.ts` | Outside `/api`, HMAC-signed, exempt from the lifecycle gate on purpose (a suspended binary must still learn it is suspended). Reads only `Business` rows, which are exempt from the guard. |
| Public branding asset `/public/business/:id/logo` | `back/src/routes/public.ts` | Reads only `Business.logoUrl` (exempt model); deliberately public, same data the public website shows. |

---

## Leak tests

| Suite | What it proves |
|---|---|
| `back/src/routes/__tests__/tenant-leak.test.ts` | 26 route families with business A and B data, acting as A: (a) lists return exactly A's rows, (b) each cross-business id operation answers the route's existing contract (`404`, or `422 cross_tenant` where it already applied) — contracts are pinned, not changed, (c) no write is recorded against B (`fake.writes`). Families: `locations`, `services`, `products`, `resources`, `tags`, `campaigns`, `fichajes`, `sales` (generic CRUD); `sale-lines`, `customers`, `employees` + schedule, `bookings`, `categories` (teams + members), `contactos`, `pedidos`, `invoices`, `documents`, `reminders`, `visit-states`, `visits`, `time-off`, `packages`, `config-horario` (`OpeningHour`), `settings`, `users`, `tenant-keys`. It also asserts the test double itself honours `{ parent: { businessId } }` filters on child tables. |
| `back/src/lib/__tests__/tenant-scope.test.ts` | Every operation type without a business throws; the non-scoping shapes (`OR`, `NOT`, `in`, `undefined`, empty `AND`) throw; a child query without the parent filter throws; classification is complete and disjoint. |
| `back/src/lib/__tests__/tenant-scope-cron.test.ts` | Crons can read across businesses only inside `runUnscoped`. |
| `back/src/lib/__tests__/tenant-scope-transaction.test.ts` | The guard survives `$transaction` and the lazy-promise trap. |

The route tests run against `back/src/routes/__tests__/_fake-prisma.ts`, which installs the same
`guardDelegateCall`, so an unscoped query fails in tests before it can reach a database.

---

## Known blind spots

These are structural gaps in the guard. Each is either covered by another layer or is a rule for
reviewers.

| Blind spot | Today |
|---|---|
| **Raw SQL** — `$queryRaw` / `$executeRaw` never reach the guard (there are no `$queryRawUnsafe` / `$executeRawUnsafe` call sites) | Files: `back/src/lib/availability.ts` (row locks `FOR UPDATE` by id; the owning queries around them are scoped), `back/src/lib/bookings/agent-bookings.ts` (joins `aa.*` through `Business.tenantId`), `back/src/lib/digestScheduler.ts` and `back/src/lib/reminderDrainer.ts` (cron sweeps across all businesses by design), `back/src/lib/projects/create-project-service.ts` and `back/src/lib/projects/token-charge.ts` (`aa.tenant`), `back/src/routes/sale-lines.ts` (lock on `crm.venta` by id), `back/src/routes/tenants.ts` (reads `aa.tenant`), `back/src/routes/service-operator.ts` (operator lane), `back/src/scripts/provision-mock-projects.ts` (script). Any raw query that returns `crm` rows must carry its own `negocio_id` predicate — the guard cannot add it. |
| **`include` from the exempt root `Business`** | `Business` is exempt, so `prisma.business.findUnique({ include: { customers: true } })` would return another business's children unvalidated. Nothing does it today (every `business` query uses `select`: `back/src/lib/business.ts`, `back/src/lib/tenant-lifecycle/resolver.ts`, `back/src/routes/auth.ts`, `back/src/routes/bookings.ts`). Rule: read tenant rows from their own delegate. |
| **Nested writes and `connect` inside `data`** | The guard only inspects the top-level `businessId`. Nested creates (`data: { lines: { create: [...] } }`) and nested `connect` are not walked; ownership of the referenced rows is enforced by `assertFks` in `back/src/lib/tenant.ts` where routes call it, and by the parent-FK check on child creates. |
| **Implicit m2m tables** | `Customer.tags` / `Tag.customers` (relation `CustomerTags` in `back/prisma/schema.prisma`) materialise as a Prisma-managed join table with no model, so the guard cannot see it. Ownership is covered by `assertFks` on the ids the route writes. |
| **Soft delete** | Isolation is not deletion policy: the guard never requires `eliminadoEn: null`. Routes add it; a missing one is a visibility bug, not a cross-business leak. |

---

## Database posture (RLS and grants)

| Topic | Fact |
|---|---|
| Who the API connects as | One role, from `DATABASE_URL` (`back/src/prisma.ts`, adapter `schema: DB_SCHEMA ?? 'crm'`). Migrations use that same variable (`back/prisma.config.ts` → `datasource.url`), so the API's role **owns** the `crm` tables. |
| Consequence | Postgres exempts a table's owner from RLS. An API query is therefore never filtered by a policy — RLS is not in the API's isolation path. |
| Existing policies | 33 `CREATE POLICY` statements across `back/prisma/migrations`, all `TO authenticated` and all keyed on `auth.uid()` (30 `FOR SELECT`, plus 1 `ALL`, 1 `UPDATE`, 1 `INSERT` on `storage.objects`); 17 tables have `ENABLE ROW LEVEL SECURITY`. They exist for **direct Supabase clients** (JWT-carrying `authenticated` role, including Storage), not for the API. |
| The panel does not use them | `front/lib/data/backend.ts` selects the REST backend or the localStorage demo backend; the direct Supabase data path was removed. Storage uploads go through the backend service-role client (`back/src/routes/upload.ts`). |
| `FORCE ROW LEVEL SECURITY` | Used nowhere (no migration contains it). Enabling it **would break the API**: the owner would be subject to policies written for `authenticated` + `auth.uid()`, and an API connection has no `auth.uid()`, so tenant tables would return no rows and mutations would fail. Do not add it. |
| Grants | No `GRANT`/`REVOKE` in `back/prisma/migrations`; privileges are whatever Supabase's defaults gave `anon` / `authenticated`. That is exactly what `db/check-security.sql` measures. |

### Verifying the posture

`db/check-security.sql` is read-only (catalog `SELECT`s only) and answers: which `crm` tables lack
RLS, which have `FORCE RLS` (expected: none), what `anon`/`authenticated` were granted, who owns each
table, and which policies exist. Run it as the API's own role, against a read-only DSN:

```bash
psql "$DATABASE_URL" -f db/check-security.sql
```

The `rls-posture` job in `.github/workflows/security.yml` is intentionally **disabled**; enabling it
requires a dedicated read-only DSN secret (`SECURITY_READONLY_DATABASE_URL`), never the API or
migration credential.

---

## Adding a new model

1. Add the model to `back/prisma/schema.prisma` — with `businessId` if the row belongs to one
   business, without it (plus a mandatory parent relation) if it is a child table.
2. Classify it in `back/src/lib/tenant-scope.ts`: `TENANT_MODELS`, `NULLABLE_TENANT_MODELS`,
   `CHILD_MODELS` (with `relations` + `foreignKeys`), or `EXEMPT_MODELS`.
   The self-check test fails if you skip this, and the guard fails closed at runtime
   (`modelo sin clasificar`).
3. Write every query with the business: `{ id, businessId }` for writes by id, `{ parent: { businessId } }`
   for child tables, `businessId` (or `business: { connect }`) on creates.
4. If a query genuinely cannot know the business, wrap it in `runUnscoped('<reason>', …)` and
   `await` inside the callback. Add the call site to the table in this document (it is a reviewed
   list, not an open door).
5. Add the route family to `back/src/routes/__tests__/tenant-leak.test.ts` (list + cross-business id
   operations, asserting no write reaches B).

---

## References

- Guard and model classification: `back/src/lib/tenant-scope.ts`
- Guard installation: `back/src/prisma.ts`; error mapping: `back/src/middleware/error.ts`
- FK ownership gate: `back/src/lib/tenant.ts`
- Route mounts: `back/src/routes/index.ts`, `back/src/server.ts`
- Leak suite: `back/src/routes/__tests__/tenant-leak.test.ts`
- Read-only posture check: `db/check-security.sql`
