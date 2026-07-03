# Proposal: crm-operator-bot-write-ops

## Problema

El bot de chat (`gru_orchestrator/apps/chat-gateway`, `CrmClient`) tiene 8 métodos que
pegan a `/api/*` con `Authorization: Bearer CRM_SERVICE_TOKEN`:

- `createCustomer`/`listCustomers` → `/api/customers`
- `createInvoice`/`listInvoices` → `/api/invoices`
- `createSale`/`listSales` → `/api/sales`
- `listTenants` → `/api/tenants`
- `createProject` → `/api/projects`

Pero `/api/*` está protegido por `authenticate` (`creador_CRM/back/src/middleware/auth.ts`),
que exige un JWT Supabase de sesión de usuario real, verificado vía JWKS — no contempla
ningún modo servicio ni bypass. En modo real (no dry-run), estas 8 llamadas fallarán con
401, o dependerán de reusar un JWT humano expirable (frágil, no es el diseño).

Ya migramos `listProjects` a `/service/operator/proyectos` (auth `x-service-token` /
`OPERATOR_SERVICE_TOKEN`, fuera de `/api`, sin sesión de usuario) — mismo problema, mismo
patrón de solución ya validado y auditado.

## Investigación previa (verificada, no repetir)

- `customers.ts`, y los `crudRouter('sale'/'invoice', ...)` (`lib/crud.ts`) usan
  **solo `businessId`** — `req.userId` no se persiste ni se usa más allá de la
  autorización previa del middleware. Migrar estas rutas NO pierde atribución (no
  existía).
- `tenants.ts` GET no usa `userId` en absoluto.
- `createProject` (`projects.ts` POST, vía `create-project-service.ts:123`) SÍ necesita
  un `userId` real para crear el `Membership` ADMIN del proyecto — pero
  `/service/operator/proyectos` (POST, ya existe) YA resuelve esto vía
  `OPERATOR_OWNER_USER_ID` (env). No hace falta ruta nueva para esto, solo cambiar el
  cliente.

## Solución

Extender `/service/operator/*` (mismo middleware `requireOperatorToken`, mismo patrón
fail-closed) con:

- `GET /service/operator/tenants` — lista tenants activos (espejo de `/api/tenants` GET).
- `GET /service/operator/customers?businessId=` / `POST /service/operator/customers`
  (body incluye `businessId`).
- `GET /service/operator/invoices?businessId=` / `POST /service/operator/invoices`.
- `GET /service/operator/sales?businessId=` / `POST /service/operator/sales`.

Todas validan que `businessId` existe y no está soft-borrado (`eliminadoEn IS NULL`)
antes de operar — mismo control que ya aplican las rutas `/api/*` equivalentes vía
membership, pero explícito por parámetro en vez de por sesión.

`CrmClient` (chat-gateway): los 8 métodos pasan a usar `requestOperator()` (ya existe,
creado para `listProjects`) contra las rutas nuevas + `createProject` apunta a
`/service/operator/proyectos` (ya existente, sin cambios en el back para este).

## Alcance

- `creador_CRM/back/src/routes/service-operator.ts` (6 rutas nuevas).
- `gru_orchestrator/apps/chat-gateway/src/core/ops/crm-client.ts` (8 métodos re-apuntados).
- Tests de las rutas nuevas (back) + verificación de compilación (chat-gateway).

## Fuera de alcance

- Cambios en `/api/*` (siguen existiendo para el front de usuario, intactos).
- Atribución/auditoría de escrituras del bot (no regresión: no existía antes).
