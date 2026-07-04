# Propuesta — Retirar POST /auth/register

**Nivel Gru: 2 — Medium.** Retirada de endpoint de autoregistro + saneado de deuda en la suite e2e. Cambio reversible por git; el único punto de riesgo real (datos ya creados en producción) se aísla como ítem de seguimiento post-cierre.
**Estado: SPEC (aprobado el alcance, pendiente implementación).**

## Contexto
`back/src/routes/auth.ts:52-111` expone `POST /auth/register`: autoregistro directo que
crea un `Business` (tabla `crm.negocio`) **sin `tenantId`**, saltándose por completo
agents-agency. El flujo de negocio real siempre es: **lead → cliente (tenant en `aa`) →
proyecto CRM asignado a ese tenant**. Un negocio sin tenant no debería poder nacer por esta
vía. Además el endpoint estuvo vivo en producción **sin guard de `NODE_ENV`**, de modo que
cualquiera podía crear negocios huérfanos.

En la práctica el endpoint hoy solo lo usan los tests e2e como atajo para fabricar un
negocio de prueba; el front no depende de él (usa `/auth/register-client`, que es otro
endpoint distinto y se mantiene intacto).

## Intención
- Eliminar la capacidad de crear un negocio sin tenant vía HTTP: se retira la ruta
  `POST /auth/register` y su esquema de validación.
- Que la suite e2e siga fabricando su negocio-fixture, pero mediante **inserciones
  directas** (Supabase admin + Prisma), sin reintroducir por la puerta de atrás un helper
  oculto que reimplemente "crear negocio sin tenant".
- Aprovechar el cambio para **saldar la deuda** de 9 ficheros e2e que duplican su propio
  `registerAndToken` local en vez de usar el compartido de `_shared.e2e.ts`.

## Alcance
- **Ruta + esquema:** borrar el handler `authRouter.post('/register', …)` (auth.ts:52-111)
  y el `registerSchema` zod (auth.ts:43-50); actualizar/retirar el bloque de comentario
  descriptivo (auth.ts:37-42).
- **Fixture e2e (núcleo):** reconstruir `registerAndToken` en `_shared.e2e.ts:102-117` para
  que cree el negocio con inserciones directas —`supabaseAdmin.auth.admin.createUser` +
  Prisma directo a `Business` / `Location` / `User` / `Membership`, replicando lo que hacía
  la transacción del endpoint (auth.ts:86-101)— sin pasar por HTTP. `getSharedAuth` hereda
  el helper reconstruido sin cambios de firma.
- **Migración de duplicados:** los 9 ficheros con `registerAndToken` local
  (`auth-profile`, `bookings-team`, `notifications`, `employee-schedules`, `documents`,
  `categories`, `sale-lines`, `settings`, `auth-users`) pasan a importar el helper
  compartido y se les borra la copia local.
- **Tests de la feature que desaparece:** en `auth-users.e2e.test.ts` se **borran** los 3
  tests que ejercitaban el endpoint como funcionalidad (registro OK, email duplicado → 409,
  password débil → 422). No se migran: la feature ya no existe.
- **Fixtures que solo lo usaban de paso:** `auth-client-register.e2e.test.ts` (llama a
  `/auth/register` inline para preparar terreno antes de probar `register-client`) y
  `bookings-timezone.e2e.test.ts` (uso parcial) pasan a usar el fixture reconstruido.
- **Docs:** retirar la línea `back/README.md:73` que documenta `POST /auth/register`.

## Fuera de alcance
- **`POST /auth/register-client`**: es otro endpoint (alta de cliente final), lo usa el
  front (`front/lib/api/account.ts`) y **se mantiene intacto**. Comparte `registerLimiter`
  (auth.ts:21), que por tanto **NO se elimina**.
- **`Business.tenantId` sigue siendo nullable** en el schema: lo usan seeds/demo. Este
  cambio **no fuerza `NOT NULL`** ni toca el schema Prisma.
- **UX del generador, terminología, otros endpoints de `auth`** (`login`, `me`,
  `set-password`, etc.): sin cambios.

## Riesgo — datos huérfanos reales (seguimiento post-cierre)
El endpoint corrió en producción sin guard, así que pueden existir negocios reales
(`crm.negocio` con `tenantId = NULL`) creados por esta vía. Adrian decidió **no** auditar
producción antes de escribir este proposal. Por tanto:
- Retirar la ruta es seguro e independiente de esos datos (no los borra ni los toca).
- **Antes de dar el cambio por cerrado**, queda un ítem **manual, a cargo de Adrian**:
  verificar en Supabase qué negocios huérfanos existen y decidir su limpieza. No es
  bloqueante para escribir el spec ni para retirar la ruta, pero sí para cerrar el change.
  Está listado explícitamente en `tasks.md` como tarea manual no automatizable por el agente.

## Riesgos técnicos y mitigación
- **Regresión en la suite e2e** al reconstruir el fixture: mitigado exigiendo la suite
  completa en verde antes/después y comparando que cada fichero migrado se comporta igual.
- **Reintroducir la deuda** con un helper interno oculto: mitigado por diseño —el fixture
  vive centralizado en `_shared.e2e.ts` como inserción directa, no como reimplementación
  del endpoint retirado.
