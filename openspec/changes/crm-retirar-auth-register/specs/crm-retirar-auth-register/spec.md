# Spec — Retirar POST /auth/register

## UC-1 — Eliminar la ruta que crea negocios sin tenant
**GIVEN** que existe `POST /auth/register` en `back/src/routes/auth.ts`
**WHEN** se retira el handler y el esquema de validación
**THEN** el sistema NO DEBE permitir crear un negocio por esa vía; una petición a la ruta responde 404.

- AC-1.1 El handler `authRouter.post('/register', ...)` debe estar eliminado de `auth.ts`.
- AC-1.2 El esquema `registerSchema` de zod debe estar eliminado de `auth.ts`.
- AC-1.3 Una petición `POST /api/auth/register` con cuerpo válido responde **404**, no 201.
- AC-1.4 `tsc` del back queda limpio; no hay referencias a `registerSchema` ni al handler retirado.

## UC-2 — Reconstruir el fixture e2e sin pasar por HTTP
**GIVEN** que la suite e2e necesita un negocio-fixture para sus tests
**WHEN** el endpoint `POST /auth/register` deja de existir
**THEN** el fixture debe construir el negocio mediante inserción directa (Supabase admin + Prisma), replicando la lógica transaccional del endpoint original.

- AC-2.1 `registerAndToken(email, pw, t)` en `_shared.e2e.ts` crea un negocio sin pasar por `POST /auth/register`.
- AC-2.2 El fixture usa `supabaseAdmin.auth.admin.createUser + Prisma` para crear `Business`, `Location`, `User`, `Membership` en la misma transacción que hacía el endpoint.
- AC-2.3 El fixture devuelve `{ token, businessId, userId }` idéntico al que devolvía el endpoint (mismo contrato).
- AC-2.4 Los ids creados son trackeados para `cleanup()` y las pruebas que usan el fixture quedan en verde.

## UC-3 — Consolidar helpers duplicados en e2e
**GIVEN** que 9 ficheros de test duplican su propio `registerAndToken` local
**WHEN** se centraliza el helper en `_shared.e2e.ts`
**THEN** todos los consumidores importan el helper compartido, eliminando deuda técnica y reduciendo divergencias.

- AC-3.1 Los 9 ficheros (`auth-profile`, `bookings-team`, `notifications`, `employee-schedules`, `documents`, `categories`, `sale-lines`, `settings`, `auth-users`) ya no contienen un `registerAndToken` local.
- AC-3.2 Cada uno de esos ficheros importa `{ registerAndToken, getSharedAuth }` desde `_shared.e2e.ts`.
- AC-3.3 Una búsqueda `grep "function registerAndToken\|const registerAndToken"` en `__tests__/` devuelve solo 1 resultado: en `_shared.e2e.ts`.
- AC-3.4 La suite e2e completa queda en verde con los helpers consolidados.

## UC-4 — Proteger POST /auth/register-client
**GIVEN** que existe `POST /auth/register-client` (otro endpoint distinto, usado por el front)
**WHEN** se retira `POST /auth/register`
**THEN** `register-client` sigue funcionando sin cambios; `registerLimiter` (que comparte) sigue en su lugar.

- AC-4.1 `POST /auth/register-client` responde 201 al recibir un cliente válido (sin cambios).
- AC-4.2 `registerLimiter` sigue definido y usado por `register-client`; no se elimina.
- AC-4.3 Tests de `auth-client-register.e2e.test.ts` quedan verdes.

## UC-5 — Eliminar tests de la feature desaparecida
**GIVEN** que 3 tests en `auth-users.e2e.test.ts` ejercitan `POST /auth/register` como feature
**WHEN** el endpoint deja de existir
**THEN** esos tests se eliminar (la feature no existe); el resto de los tests de ese fichero quedan verdes.

- AC-5.1 Los 3 tests que prueban registro OK (201), email duplicado (409), password débil (422) han sido eliminados.
- AC-5.2 Los tests restantes de `auth-users.e2e.test.ts` quedan verdes con el fixture consolidado.
- AC-5.3 No existen referencias residuales a `/auth/register` dentro de `auth-users.e2e.test.ts`.

## UC-6 — Actualizar documentación
**GIVEN** que `back/README.md` documenta `POST /auth/register` en la línea 73
**WHEN** el endpoint se retira
**THEN** la documentación se actualiza; la línea 73 ya no refiere al endpoint eliminado.

- AC-6.1 La línea 73 de `back/README.md` (que documenta `POST /auth/register`) ha sido eliminada.
- AC-6.2 El bloque Auth del README sigue siendo coherente y completo para los endpoints restantes.

## UC-7 — Auditar datos huérfanos en producción (manual)
**GIVEN** que el endpoint corrió en producción sin guard de NODE_ENV
**WHEN** se cierra este change
**THEN** Adrian verifica manualmente en Supabase qué negocios huérfanos existen y decide su tratamiento.

- AC-7.1 Adrian ha consultado `crm.negocio WHERE tenant_id IS NULL` en Supabase producción.
- AC-7.2 Adrian ha identificado cuáles son negocios huérfanos reales vs. seeds/demo legítimos.
- AC-7.3 Adrian ha decidido el tratamiento (conservar, migrar a un tenant, o hard delete) y registrado la decisión.
- AC-7.4 Esta auditoría cierra oficialmente el change (no bloquea la retirada de la ruta ni el spec).
