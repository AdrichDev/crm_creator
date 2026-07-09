# Validación — crm-onboarding-tenant-keys

Historia: como **operador que hace onboarding de un negocio** (miembro `ADMIN` de ese negocio),
quiero un paso "BD, API y Keys" estilo Vercel donde pegar la URL de conexión de BD (cifrada), el
dominio del backend (público) y las API keys de OpenAI/Gemini/Anthropic/Google Maps, con Guardar y
Probar conexión por tarjeta, para dejar el tenant listo sin credenciales en claro ni curl/Postman, y
para que el mismo panel y los mismos endpoints los reutilice después el autoservicio del tenant.

## Criterios de aceptación (AC)
- **AC1 (secretos cifrados, valor nunca devuelto):** la URL de BD y las 4 API keys se persisten en el
  store cifrado (`TenantSecret`, AES-256-GCM); ningún endpoint (`GET`/`PUT`/`DELETE`/`test`) devuelve
  el valor de un secreto, ni en claro ni cifrado, ni al propio dueño del negocio, ni en 200 ni en 500.
- **AC2 (BD deja de viajar en claro):** el bloque de BD del onboarding persiste `DATABASE_URL` como
  slot cifrado, no como campos sueltos en `BusinessSetting.datos`; el dominio de Backend API
  (`draft.api.url`, público) sigue en el config plano.
- **AC3 (auth por sesión + membership, cross-tenant imposible):** los 4 endpoints requieren sesión
  Supabase (`authenticate`) y una `Membership` de `req.userId` para el `:businessId` del path (patrón
  `projects.ts:111`); si el usuario no es miembro de ese `:businessId` → 404, sin tocar datos. No hay
  forma (path, body ni header) de que un usuario opere sobre un negocio del que no es miembro.
- **AC4 (gate de rol sobre la membership del path):** solo `ADMIN`/`MANAGER` de ese `:businessId`
  pueden leer/escribir; `EMPLOYEE`/`CLIENT` reciben 403. El rol se evalúa sobre la `Membership` del
  `:businessId` del path (no sobre `req.role`, que depende del `x-business-id` activo, que puede
  diferir en onboarding).
- **AC5 (catálogo cerrado, sin scope del cliente):** los endpoints solo aceptan los 5 nombres del
  catálogo; un `:name` fuera de él responde 404 `unknown_secret`. `scope`/`envVarName` los fija el
  servidor; cualquier valor de esos campos en el body de `PUT` se ignora.
- **AC6 (test real, sin fuga):** `POST .../test` llama al proveedor/BD real vía
  `testProviderConnection` y responde `{ ok, detail? }` sin incluir jamás el `value` ni el body/URL
  crudo, ni en la respuesta ni en logs; un rechazo del proveedor es `ok: false`, no un error HTTP.
- **AC7 (rate limit del test):** más de 5 llamadas a `/test` en 60s sobre el mismo `businessId:name`
  responden 429 sin volver a contactar al proveedor.
- **AC8 (Maps por propagación runtime):** la tarjeta de Maps confirma el cambio vía
  `GET /tenant-config` (auth dual sesión + `x-business-id` de `crm-tenant-secrets-runtime-maps`),
  comprobando `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, sin mintear ninguna `TenantApiKey`
  desechable.
- **AC9 (componente reutilizable):** `TenantKeysPanel` recibe el `businessId` como prop y funciona
  igual montado en el onboarding (`editing.id`) que en la Configuración (`businessId` de sesión), de
  modo que `crm-tenant-keys-self-service` lo reutilice sin duplicarlo.

## Por tarea (Given-When-Then + test)
- **WU1** Catálogo → Given `catalog.ts`, When se consulta `TENANT_SECRET_CATALOG`/`findSecretSlot`,
  Then los 5 slots tienen `scope`/`envVarName`/`provider` exactos y un nombre desconocido devuelve
  `undefined` sin lanzar. Test: unitario de `catalog.ts`.
- **WU2** `testProviderConnection` → Given un `provider` y un `value` de fixture, When se mockea
  `fetch`/`pg` a ok/rechazo/timeout, Then devuelve `{ ok }`/`{ ok: false, detail }` sin que `value`
  ni la cadena `DATABASE_URL` aparezcan en `detail` ni en `console.*`. Test: `provider-test.test.ts`.
- **WU3.2** `GET .../secrets` → Given un negocio con `ANTHROPIC_API_KEY` configurado y los otros 4
  vacíos, When `GET` con sesión `ADMIN` miembro, Then 5 entradas, solo `ANTHROPIC_API_KEY`
  `configured: true`, ninguna con valor. Test: `tenant-keys.route.test.ts`.
- **WU3.3** `PUT .../secrets/:name` → Given sesión `MANAGER` miembro y `{ value: 'sk-test' }`, When
  `PUT .../OPENAI_API_KEY`, Then 200 `configured: true` sin el valor, y `readTenantSecret` posterior
  descifra exactamente `'sk-test'`; `value` vacío o con `\n` → 422 `invalid`; `:name` `'FOO'` → 404
  `unknown_secret`. Test: `tenant-keys.route.test.ts`.
- **WU3.4** `DELETE .../secrets/:name` → Given un slot configurado, When `DELETE`, Then 200
  `configured: false` y la fila ya no existe; repetir → 404 `secret_not_found`; `:name` fuera de
  catálogo → 404 `unknown_secret`. Test: `tenant-keys.route.test.ts`.
- **WU3.5** `POST .../test` → Given un secreto guardado o un `value` en el body, When se llama con
  `testProviderConnection` mockeado, Then `{ ok, detail? }` correcto; `:name` desconocido → 404;
  sin valor disponible → 404 `no_value`; 6º intento en la ventana → 429; ningún log trae el `value`.
  Test: `tenant-keys.route.test.ts`.
- **WU4** Componente → Given `GET .../secrets` mockeado con 2 de 5 configurados, When `TenantKeysPanel`
  monta, Then renderiza las Cards con el badge correcto; When se guarda un valor, Then `PUT` con ese
  valor y el input queda vacío (valor no persiste en el DOM); When se prueba Maps, Then llama
  `/tenant-config` (no `.../test`); When se elimina, Then pide confirmación. Test:
  `tenant-keys-panel.test.tsx`.
- **WU5** Onboarding → Given el paso 4, When se renderiza, Then el stepper muestra "BD, API y Keys",
  el bloque BD tiene un único campo URL que persiste como `DATABASE_URL` cifrado (no campos sueltos),
  el backend API sigue en el config plano, y el bloque API Keys monta las 4 tarjetas. Test:
  ampliación de la suite del onboarding (o nueva) verificando que los secretos no viajan por
  `createProject`/`updateProject`.
- **WU6** Cross-tenant + fuga cero → Given 2 negocios A/B y un usuario miembro solo de A, When se
  intenta cualquier endpoint con `:businessId = B`, Then 404 y B inalterado; When se inspecciona
  cualquier respuesta, Then no aparece `valueCiphertext`/`iv`/`authTag` ni el valor en claro. Test:
  suite de aislamiento en `tenant-keys.route.test.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.
> Dependencia de orden: el backend (`crypto.ts`, `store.ts`, `authenticate`, `Membership`) ya existe
> en el repo, así que WU1-WU3/WU5-WU6 no están bloqueadas. La confirmación runtime de Maps (AC8/WU4-Maps)
> SÍ requiere `GET /tenant-config` con `publicEnvSecrets` + auth dual, que aporta
> `crm-tenant-secrets-runtime-maps` — por eso ESE change se implementa PRIMERO. El resto del panel
> (guardar/probar AI+DB, cross-tenant, cifrado) no depende de él.

## Estado
PROPUESTA — sin iniciar. Este change es el DUEÑO del backend compartido (catálogo de 5 slots,
`testProviderConnection`, endpoints `/tenant-keys/:businessId/secrets`, componente `TenantKeysPanel`)
que `crm-tenant-keys-self-service` reutiliza sin duplicar. No hay dependencias bloqueantes: el modelo
`TenantSecret`, el cifrado y `GET /tenant-config` con `publicEnvSecrets` ya están en el repo.
