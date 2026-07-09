# crm-onboarding-tenant-keys

## Intención
Que el paso "Base de datos" del onboarding de negocio deje de pedir credenciales sueltas en claro y
pase a ser un panel de "BD, API y Keys" estilo Vercel: una sola URL de conexión de BD (secreta), el
dominio público del backend (no secreto) y un bloque de **API Keys por-tenant** (OpenAI, Gemini,
Anthropic, Google Maps) donde cada slot es una tarjeta con pegar-valor, **Guardar** (cifrado) y
**Probar conexión**. Los secretos van a un **único store cifrado** (`TenantSecret`, AES-256-GCM), el
valor **nunca** se devuelve por HTTP, y el mismo componente y los mismos endpoints se reutilizan
después en el autoservicio del tenant (`crm-tenant-keys-self-service`).

Este change disuelve el "panel de operador" que se había planteado como superficie separada: no hay
grupo de rutas `(operator)` ni cliente `x-service-token` en el navegador. La gestión humana de keys
vive **dentro del onboarding** (y del panel de Configuración, vía la change hermana), autenticada por
la **sesión del usuario + su `Membership`**, exactamente como el resto del CRM.

## Problema
Verificado en código:
- **El onboarding hornea credenciales de BD en claro.** `front/app/onboarding/page.tsx:28` define
  `STEPS = ['Tipo de negocio','Módulos','Marca','Base de datos','Datos']`; el bloque `step === 3`
  (líneas 270-306) pide host/puerto/nombre/usuario/contraseña de BD por separado más una URL y el
  dominio de Backend API (`draft.api.url`). Ese draft se persiste vía `createProject(cfg)` /
  `updateProject(id, cfg)`, que guardan el config en `BusinessSetting` (categoría `CONFIG_CATEGORY`,
  columna `datos` JSON) **en claro** (`back/src/routes/projects.ts:128-133`). Es decir, hoy una
  cadena de conexión con `user:pass` acabaría en una columna sin cifrar.
- **No hay superficie humana para las API keys de proveedores.** Existe cifrado y lectura
  server-side (`back/src/lib/tenant-secrets/crypto.ts` — `encryptSecret`/`decryptSecret`;
  `back/src/lib/tenant-secrets/store.ts` — `readPublicSecrets`/`readTenantSecret`/`getTenantSecret`/
  `readBakeableSecrets`) sobre el modelo `TenantSecret` (`businessId`, `name`, `scope`
  `FRONTEND_PUBLIC|BACKEND_SECRET`, `valueCiphertext`/`iv`/`authTag`/`keyVersion`, `envVarName`,
  único por `(businessId, name)`). Pero la única forma de escribir esos secretos hoy es el router de
  operador (`back/src/routes/service-operator-tenant-keys.ts`), tras `requireOperatorToken` (token
  global de servidor a servidor), pensado para el bot, no para un humano con navegador.
- **No existe test de conexión.** Ningún módulo llama al proveedor para validar que una key pegada
  funciona antes de que el tenant dependa de ella. El operador "adivina" que la clave es buena.
- **No existe endpoint humano por sesión+membership para secretos.** El CRM autentica por sesión
  Supabase (`authenticate`, puebla `req.userId`) y autoriza por `Membership`; el ejemplo canónico es
  `PATCH /projects/:id` (`back/src/routes/projects.ts:109-136`), que hace
  `prisma.membership.findFirst({ where: { userId: req.userId, businessId: id } })` y responde 404 si
  el usuario no es miembro. No hay ningún endpoint de secretos montado sobre ese mismo patrón.

## Alcance
- **Catálogo fijo server-side de 5 slots** (`back/src/lib/tenant-secrets/catalog.ts`, nuevo — única
  fuente de verdad, sin `scope`/`envVarName` aceptados desde el cliente):
  - `OPENAI_API_KEY` → `BACKEND_SECRET`.
  - `GEMINI_API_KEY` → `BACKEND_SECRET`.
  - `ANTHROPIC_API_KEY` → `BACKEND_SECRET`.
  - `GOOGLE_MAPS_API_KEY` → `FRONTEND_PUBLIC`, `envVarName = NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
  - `DATABASE_URL` → `BACKEND_SECRET`. La cadena `postgresql://user:pass@host/db` lleva credenciales:
    es un secreto, va al store cifrado, **no** al config plano de `BusinessSetting`.
- **`back/src/lib/tenant-secrets/provider-test.ts`** (nuevo — módulo puro compartido):
  `testProviderConnection(provider, value): Promise<{ ok, detail? }>`. Llamada barata con timeout
  corto contra el proveedor real (OpenAI/Gemini/Anthropic = listar modelos; `database` = conexión de
  solo lectura `SELECT 1`). No loguea `value` ni el body crudo. Rate-limit básico reusando
  `back/src/lib/rateLimit.ts`.
- **Endpoints nuevos por sesión + membership** (bajo el router `authenticate`, prefijo `/tenant-keys`),
  `businessId` SIEMPRE validado por `Membership` del `req.userId` como `projects.ts:111`, nunca a
  ciegas, y gate de rol `ADMIN`/`MANAGER`:
  - `GET  /tenant-keys/:businessId/secrets` — estado de los 5 slots (`configured`, `scope`,
    `envVarName`, `updatedAt`); nunca el valor.
  - `PUT  /tenant-keys/:businessId/secrets/:name` — alta/actualización de un slot del catálogo fijo
    (rechaza `name` fuera del catálogo); cifra y upsert.
  - `DELETE /tenant-keys/:businessId/secrets/:name` — limpia el slot (vuelve al `fallbackEnv` del
    operador si aplica).
  - `POST /tenant-keys/:businessId/secrets/:name/test` — usa el `value` del body o descifra el
    guardado, llama a `testProviderConnection`, responde `ok`/`error` sin filtrar el valor.
- **Componente front reutilizable** `front/components/config/tenant-keys-panel.tsx` (nuevo): tarjetas
  por-slot estilo Vercel (input pegar/actualizar, Guardar cifrado, Probar conexión, estado
  no-configurado/configurado/probando/ok/error — **nunca** el valor). Montado en el onboarding por
  este change; reutilizado por `crm-tenant-keys-self-service` en la pestaña de Configuración.
- **Onboarding paso 4 (`front/app/onboarding/page.tsx`):**
  - `STEPS[3]` `'Base de datos'` → `'BD, API y Keys'` (label corto del stepper).
  - Bloque BD → **un solo** campo "URL de conexión" (`draft.database.url`); se retiran host/puerto/
    nombre/usuario/contraseña sueltos. La URL es secreta → slot `DATABASE_URL` del store cifrado, no
    el config plano.
  - Backend API (`draft.api.url`, dominio público) → **se queda** en el config plano de
    `BusinessSetting` (no es secreto).
  - Se añade el bloque "API Keys" montando `TenantKeysPanel` con las 4 tarjetas de proveedor + la
    tarjeta de `DATABASE_URL` como "URL de conexión" del bloque BD.
- **Fuera de alcance:**
  - El router de operador (`service-operator-tenant-keys.ts`, `requireOperatorToken`) **se mantiene**
    intacto para el consumo service-to-service del bot; este change NO lo migra ni lo reutiliza para
    las superficies humanas.
  - El autoservicio del tenant sobre su propio negocio (pestaña de Configuración): lo cubre
    `crm-tenant-keys-self-service`, que **reutiliza** los endpoints, `testProviderConnection` y el
    componente `TenantKeysPanel` que define ESTE change (no los duplica).
  - El reflejo runtime de `GOOGLE_MAPS_API_KEY` sin rebuild en apps ya exportadas: lo aporta
    `crm-tenant-secrets-runtime-maps` (ya escrito), del que este change consume `GET /tenant-config`
    con auth dual + `publicEnvSecrets` para la confirmación de propagación de Maps.

## Decisiones
- **Una sola ruta con `:businessId` validado por `Membership` sirve a AMBAS superficies (preferida).**
  El operador que hace onboarding **es miembro** (rol `ADMIN`) de cada tenant que crea/gestiona; por
  eso onboarding y autoservicio comparten el mismo mecanismo de auth: sesión + `Membership` + rol.
  Solo cambia de dónde sale el `businessId`: onboarding = el `id` del proyecto en edición
  (`editing.id`, validado por membership igual que `projects.ts:111`); autoservicio = el `businessId`
  de la propia sesión del `ADMIN`/`MANAGER`. No hace falta un router separado para el autoservicio: la
  misma ruta `/tenant-keys/:businessId/secrets`, con la membership del `req.userId` validada en cada
  handler, cubre las dos superficies con un único set de código. Es más simple y evita duplicar
  handlers, catálogo, `testProviderConnection` y componente. Ver `design.md` §2.
- **El rol se gatea sobre la `Membership` del `:businessId` del path, no sobre `req.role`.** El
  middleware `requireRole` (`back/src/middleware/rbac.ts:6`) lee `req.role`, que `authenticate`
  resuelve desde el `x-business-id` **activo** de la sesión. En onboarding el `:businessId` del path
  puede no coincidir con el negocio activo del operador. Por eso el gate de rol se hace **en el
  handler** contra el rol de la `Membership` encontrada para el `:businessId` del path, no vía el
  middleware sobre `req.role`. Ver `design.md` §2.
- **El valor de un secreto NUNCA vuelve por HTTP** — ni al dueño del negocio. Los endpoints solo
  exponen estado (`configured: boolean`) y metadatos (`scope`/`envVarName`/`updatedAt`), mismo
  principio write-only que `readTenantSecret`/`getTenantSecret`.
- **`DATABASE_URL` es un secreto de primera clase, no config plano.** Migrar los campos sueltos de BD
  del onboarding a una única URL cifrada elimina la fuga de `user:pass` en la columna `datos` de
  `BusinessSetting`. El dominio de Backend API (`draft.api.url`) sí es público y permanece en el
  config plano.
- **Probar conexión difiere por slot** (ver `design.md` §1 y §6):
  - OpenAI/Gemini/Anthropic → `testProviderConnection` con llamada real barata al proveedor.
  - `DATABASE_URL` → `testProviderConnection('database', value)`: conexión de solo lectura con
    timeout corto, sin loguear la cadena.
  - `GOOGLE_MAPS_API_KEY` → confirmación de **propagación runtime**, no validez ante Google: tras
    Guardar, el front llama `GET /tenant-config` (auth dual sesión + `x-business-id`, aportada por
    `crm-tenant-secrets-runtime-maps`) y confirma que `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
    refleja el valor nuevo. Esto reemplaza el flujo antiguo de emitir/revocar una `TenantApiKey`
    desechable: con la sesión del propio humano no hace falta mintear una credencial de un solo uso.
- **Borrado: hard delete, sin tombstone.** `TenantSecret` no tiene campo de baja lógica y no hay
  requisito de auditoría histórica de secretos (a diferencia de `TenantApiKey.revokedAt`). Un secreto
  borrado es indistinguible de uno que nunca existió; añadir `deletedAt` exigiría migración y un
  filtro `deletedAt: null` en CADA lectura existente sin beneficio real. Ver `design.md` §4.

## Riesgos
- **Primera superficie humana de escritura de secretos por sesión.** Hasta ahora los secretos solo se
  escribían por `requireOperatorToken` (bot). Abrir escritura por sesión + membership exige gate de rol
  estricto (`ADMIN`/`MANAGER`) sobre la membership del `:businessId` del path y revisión de seguridad
  dedicada antes de push. Mitigación: el patrón de auth es el mismo ya probado en `projects.ts:111`;
  el gate de rol se verifica en tests (403 para `EMPLOYEE`/`CLIENT`).
- **Test de conexión = oráculo de validez de clave ajena.** `POST .../test` llama al proveedor real
  con la clave tecleada. Mitigación: timeout corto + rate-limit por `businessId:name`
  (`back/src/lib/rateLimit.ts`, en memoria, mismo mecanismo que `auth.ts`); nunca se loguea ni se
  devuelve el `value` ni el body crudo. `crm-tenant-keys-self-service` hereda esta mitigación al
  reutilizar el mismo endpoint.
- **Fuga de valor por log o respuesta.** `testProviderConnection` y los handlers deben evitar que el
  `value`, la cadena `DATABASE_URL` o el body del proveedor lleguen a logs, JSON o trazas de error.
  Se verifica explícitamente en tests (ver `validation.md`).
- **Cross-tenant si el gate de membership se omite en una ruta futura.** El único guardián contra
  cross-tenant es el `membership.findFirst` por `:businessId` del path. Mitigación: se centraliza en
  un helper reusado por los 4 handlers, y los tests verifican 404 cuando el `req.userId` no es miembro
  del `:businessId` (ver `validation.md` AC "cross-tenant imposible").
- **Migración de datos del onboarding existente.** Negocios ya creados tienen credenciales de BD en
  claro en `BusinessSetting.datos`. Este change NO migra automáticamente esos datos (fuera de alcance);
  solo cambia la superficie de captura para negocios nuevos y ediciones futuras. La limpieza de datos
  en claro heredados se deja como deuda señalada, no se resuelve aquí.

## Dependencias
- **`crm-tenant-api-keys`** (aterrizada): modelo `TenantSecret`, cifrado
  (`back/src/lib/tenant-secrets/crypto.ts`) y lectura server-side
  (`back/src/lib/tenant-secrets/store.ts`). Este change no toca el modelo de datos; añade superficie
  HTTP humana + catálogo + test de conexión sobre él.
- **`crm-tenant-secrets-runtime-maps`** (escrita): aporta `GET /tenant-config` con auth dual
  (`TenantApiKey` O sesión + `x-business-id`) y `publicEnvSecrets`; el flujo "Probar conexión" de la
  tarjeta de Maps consume `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` por el camino de sesión.
- **`crm-tenant-keys-self-service`** (change hermana): **reutiliza** los endpoints, el catálogo,
  `testProviderConnection` y el componente `TenantKeysPanel` definidos aquí. NO los duplica. Su
  aporte propio es el montaje del componente en una pestaña de `configuracion/page.tsx`, el
  `businessId` derivado de la sesión propia y el gate de visibilidad por `MemberRole` crudo.
- Auth/rol existentes: `authenticate` (`back/src/middleware/auth.ts`, puebla `req.userId`),
  `requireRole` (`back/src/middleware/rbac.ts:6`), `Membership` + patrón `projects.ts:109-136`,
  `GET /auth/me` con `role` crudo (`back/src/routes/auth.ts:56-69`) y su cliente front
  `getAuthProfile()` (`front/lib/api/profile.ts`).
- Patrón visual de referencia: `front/components/config/integraciones-panel.tsx`
  (Card/CardBody/Badge/Button, `useDialog`).
