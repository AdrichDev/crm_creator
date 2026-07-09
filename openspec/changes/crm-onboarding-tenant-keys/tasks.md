# Tareas — crm-onboarding-tenant-keys

Alcance: catálogo fijo de 5 slots + `testProviderConnection` (módulo puro compartido) + 4 endpoints
por sesión+membership (`/tenant-keys/:businessId/secrets[...]`) + componente reutilizable
`TenantKeysPanel` + reforma del paso 4 del onboarding (BD → 1 URL cifrada, backend API plano, bloque
API Keys). Nivel 2. Sin migración de Prisma (reutiliza `TenantSecret`; hard delete sin campo nuevo).
Orden por dependencia: catálogo → módulo puro → endpoints back → cliente front → panel → onboarding →
verificación cruzada. Agentic Runtime gate antes de cualquier push. TODO es PROPUESTA, nada
implementado aún.

## WU1 — Catálogo fijo (5 slots)
- [x] 1.1 `back/src/lib/tenant-secrets/catalog.ts` (nuevo): `TENANT_SECRET_CATALOG` con los 5 slots
  (`OPENAI_API_KEY`/`GEMINI_API_KEY`/`ANTHROPIC_API_KEY` `BACKEND_SECRET`; `GOOGLE_MAPS_API_KEY`
  `FRONTEND_PUBLIC`/`envVarName=NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; `DATABASE_URL` `BACKEND_SECRET`) +
  `provider`/`group` por slot + `findSecretSlot(name)`. Única fuente de verdad; sin `scope`/
  `envVarName` aceptado desde cliente.
- [x] 1.2 Test unitario: los 5 slots con `scope`/`envVarName`/`provider` exactos; `findSecretSlot`
  devuelve `undefined` (no lanza) para un nombre fuera del catálogo.

## WU2 — `testProviderConnection` (módulo puro compartido)
- [x] 2.1 `back/src/lib/tenant-secrets/provider-test.ts` (nuevo): tipos `SecretProvider`/
  `ProviderTestResult`, `testWithTimeout` (`AbortController`, 5s), `testDatabaseUrl` (`pg`, conexión
  solo-lectura `SELECT 1`, timeout corto, cierra en `finally`) y `testProviderConnection` con las 5
  ramas (openai/gemini/anthropic/maps/database) de `design.md` §1.
- [x] 2.2 Test `provider-test.test.ts`: `fetch` y `pg` mockeados por caso (`ok`, rechazo, timeout)
  para los 5 providers; assert de que `value` nunca aparece en `detail` ni en `console.*` espiados, y
  de que la cadena `DATABASE_URL` no se filtra en ningún `detail`.

## WU3 — Endpoints back (`/tenant-keys/:businessId/secrets`)
- [x] 3.1 `back/src/routes/tenant-keys.ts` (nuevo): `requireMemberAdmin(req, res)` (membership del
  `:businessId` del path vía `prisma.membership.findFirst({ userId, businessId })` → 404 si no es
  miembro, 403 si el rol no es `ADMIN`/`MANAGER`), patrón `projects.ts:111`.
- [x] 3.2 `GET /tenant-keys/:businessId/secrets`: estado de los 5 slots (`configured`, `scope`,
  `envVarName`, `updatedAt`), nunca el valor (`select` sin `valueCiphertext`/`iv`/`authTag`). Test:
  negocio vacío → 5 `configured: false`; con 2 de 5 → estado correcto por slot.
- [x] 3.3 `PUT /tenant-keys/:businessId/secrets/:name`: 404 `unknown_secret` fuera de catálogo, 422
  `invalid` si `value` falta/vacío/con salto de línea, `encryptSecret` + `upsert` con `scope`/
  `envVarName` FIJADOS por el catálogo (ignora los del body). Test: alta, actualización, `:name`
  desconocido, `value` inválido, y que la respuesta NUNCA trae el valor.
- [x] 3.4 `DELETE /tenant-keys/:businessId/secrets/:name`: 404 `unknown_secret`/`secret_not_found`
  según corresponda, hard delete, 200 `{ name, configured: false }`. Test: borrar configurado, borrar
  vacío (404), `:name` desconocido (404).
- [x] 3.5 `POST /tenant-keys/:businessId/secrets/:name/test`: `testSecretLimiter` (bucket
  `secret-test`, `windowMs: 60_000`, `max: 5`, clave `businessId:name`, sobre
  `back/src/lib/rateLimit.ts`); resuelve `value` (body o descifrado, 404 `no_value` si ninguno);
  `testProviderConnection`; 200 `{ name, provider, ok, detail? }` sin el valor. Test: `value` del body
  vs. guardado, proveedor ok/rechaza, `:name` desconocido → 404, 6º intento → 429, sin log del
  `value`.
- [x] 3.6 `back/src/routes/index.ts`: monta `tenantKeysRouter` en `/tenant-keys` bajo `authenticate`.
  Test: smoke de que el import no rompe el arranque de `api`.

## WU4 — Cliente front + componente reutilizable
- [x] 4.1 `front/lib/api/tenant-keys.ts` (nuevo): `listSecrets(businessId)`/`upsertSecret`/
  `deleteSecret`/`testSecret`, funciones finas sobre `apiFetch` con `businessId` en el path (mismo
  patrón que `front/lib/api/users.ts`).
- [x] 4.2 `front/components/config/tenant-keys-panel.tsx` (nuevo): prop `businessId` + prop opcional
  `groups`; una Card por slot (estado no-configurado/configurado/probando/ok/error, input `password`
  nunca prefilled, Guardar/Probar/Quitar), calcado de `integraciones-panel.tsx`. Maps usa
  confirmación vía `GET /tenant-config` (sesión + `x-business-id`), no `.../test`. Test:
  `tenant-keys-panel.test.tsx` — render por slot, guardar limpia input, probar ok/error (AI y
  database), Maps vía `/tenant-config` mockeado, quitar pide confirmación, valor nunca en el DOM.

## WU5 — Onboarding paso 4
- [x] 5.1 `front/app/onboarding/page.tsx:28`: `STEPS[3]` `'Base de datos'` → `'BD, API y Keys'`.
- [x] 5.2 Bloque `step === 3` (líneas 270-306): retirar host/puerto/nombre/usuario/contraseña; añadir
  un único campo "URL de conexión" que persiste como slot `DATABASE_URL` vía `TenantKeysPanel`
  (`groups={['database']}`); mantener el input `draft.api.url` (backend público) en el config plano;
  añadir bloque "API Keys" con `TenantKeysPanel` (`groups={['ai','maps']}`).
- [x] 5.3 Confirmar el orden del wizard para que el panel disponga de `businessId` (`editing.id`)
  antes de escribir secretos (en alta nueva puede requerir guardar el proyecto base primero). Test:
  el paso 4 renderiza el panel con `businessId` resuelto; los secretos no viajan por
  `createProject`/`updateProject` (solo el config plano lo hace).

## WU6 — Consistencia cruzada (cross-tenant + fuga cero)
- [x] 6.1 Fixture de 2 negocios (A, B) + usuario miembro solo de A: para cada endpoint,
  `:businessId = B` → 404; tras operar sobre A, el `TenantSecret`/estado de B queda inalterado
  (comparación pre/post).
- [x] 6.2 Test de que ningún endpoint devuelve jamás `valueCiphertext`/`iv`/`authTag` ni el valor en
  claro, ni en 200 ni en 500 (inspección del payload completo).
- [x] 6.3 Test de que probar (`.../test` con `value` no persistido) no escribe `TenantSecret`, y que
  borrar y volver a guardar el mismo `name` funciona sin residuo (hard delete no bloquea el upsert).

## Cierre
- [x] Z.1 `tsc` limpio en `back/` y `front/`.
- [x] Z.2 Suite de `back/` verde (WU1-WU3, WU6) y suite relevante de `front/` verde (WU4-WU5).
- [ ] Z.3 Agentic Runtime review antes de cualquier push (foco: `value`/`DATABASE_URL`/token de
  proveedor nunca logueado ni devuelto; gate de membership+rol sobre el `:businessId` del path
  efectivo; rate-limit de `/test`). Pendiente: requiere revisión humana/reviewer dedicado antes de
  push, no se marca DONE por autoverificación del implementador.
- [x] Z.4 Registrar en Engram: (a) el catálogo de 5 slots incl. `DATABASE_URL` como secreto de
  primera clase; (b) que `testProviderConnection`, los endpoints `/tenant-keys/:businessId/secrets` y
  el componente `TenantKeysPanel` son COMPARTIDOS y `crm-tenant-keys-self-service` los reutiliza (no
  los duplica); (c) que el gate de rol va sobre la membership del path, no `req.role`.
