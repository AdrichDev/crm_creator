# Validación — crm-retirar-auth-register

Regla del repo: cada tarea queda OK **solo** con su test/verificación en verde. Este cambio es una retirada de endpoint + refactor de fixture: la salida observable de la suite e2e (los tests que NO son de la feature retirada) **no cambia**; lo que cambia es que el negocio de prueba se crea por inserción directa y que el endpoint deja de existir.

Historia: como responsable de producto quiero que **no exista** una vía HTTP para crear un negocio sin `tenantId`, de modo que todo negocio nazca por el flujo canónico (lead → cliente/tenant en `aa` → proyecto CRM), y que la suite de tests siga fabricando su negocio-fixture sin depender de esa vía.

## Criterios de aceptación (AC)
- **AC1**: `POST /auth/register` ya no existe; una petición a esa ruta responde 404 (no 201).
- **AC2**: `registerSchema` y el handler de `/register` se han eliminado de `auth.ts`; `tsc` del back queda limpio.
- **AC3**: `POST /auth/register-client` sigue funcionando igual y `registerLimiter` sigue presente (lo comparte `register-client`).
- **AC4**: La suite e2e completa queda en verde con el fixture reconstruido (inserción directa), salvo los tests de la feature retirada, que se han borrado.
- **AC5**: Ningún fichero de test conserva un `registerAndToken` local duplicado; todos importan el de `_shared.e2e.ts`.
- **AC6**: `back/README.md` ya no documenta `POST /auth/register`.
- **AC7 (manual, cierre)**: Adrian ha verificado en Supabase la existencia de negocios huérfanos (`crm.negocio.tenantId IS NULL` creados por la vía retirada) y ha decidido su tratamiento. Sin este AC el change no se archiva.

## Por tarea (Dado-Cuando-Entonces + test)

### T1 — Retirar ruta + esquema
- **Dado** el back arrancado, **Cuando** se hace `POST /api/auth/register` con cuerpo válido, **Entonces** responde **404** (la ruta no está montada). _Test e2e: nuevo caso que asserta 404._
- **Dado** el árbol tras el cambio, **Cuando** `grep "authRouter.post('/register'"` y `grep "registerSchema"`, **Entonces** 0 resultados; **Cuando** `tsc`, **Entonces** limpio. _Test: grep + tsc._

### T2 — Preservar `register-client` y el limiter compartido
- **Dado** el back tras el cambio, **Cuando** se ejercita `auth-client-register.e2e.test.ts`, **Entonces** verde (register-client intacto). _Test: e2e existente verde._
- **Dado** `auth.ts`, **Cuando** `grep "registerLimiter"`, **Entonces** sigue definido y usado por `/register-client`. _Test: grep._

### T3 — Reconstruir el fixture compartido con inserción directa
- **Dado** `registerAndToken(email, pw, t)` reconstruido, **Cuando** un test lo invoca, **Entonces** devuelve `{ token, businessId, userId }` de un negocio real creado sin pasar por HTTP y limpiable por `cleanup()` (ids trackeados). _Test: cualquier fichero single-tenant vía `getSharedAuth` sigue verde._
- **Dado** el fixture, **Cuando** se revisa su implementación, **Entonces** usa `supabaseAdmin.auth.admin.createUser` + Prisma (`Business`/`Location`/`User`/`Membership`), **no** una llamada a `/auth/register`. _Test: revisión + grep sin `/auth/register` en `_shared.e2e.ts`._

### T4 — Migrar los 9 duplicados al helper compartido
- **Dado** los 9 ficheros (`auth-profile`, `bookings-team`, `notifications`, `employee-schedules`, `documents`, `categories`, `sale-lines`, `settings`, `auth-users`), **Cuando** `grep "function registerAndToken\|const registerAndToken"` en `__tests__/`, **Entonces** solo aparece en `_shared.e2e.ts`. _Test: grep + suite verde._

### T5 — Borrar los tests de la feature retirada
- **Dado** `auth-users.e2e.test.ts`, **Cuando** se revisa tras el cambio, **Entonces** ya no contiene los 3 tests de registro OK / email duplicado 409 / password débil 422 (la feature no existe), y el resto de sus tests siguen verdes con el helper compartido. _Test: revisión + suite verde._

### T6 — Actualizar docs
- **Dado** `back/README.md`, **Cuando** se busca `POST /auth/register` (línea 73), **Entonces** no aparece; el resto del bloque Auth queda coherente. _Test: grep._

### T7 — Verificación de negocios huérfanos (manual, Adrian)
- **Dado** el entorno Supabase de producción, **Cuando** Adrian consulta `crm.negocio WHERE tenant_id IS NULL`, **Entonces** obtiene el listado y decide limpieza o conservación; se registra la decisión. _Verificación: manual, no automatizable por el agente. Cierra el change._

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec, no hay implementación válida.
