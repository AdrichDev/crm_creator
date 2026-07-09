# Spec delta — Capacidad: API keys y secretos por negocio (superficie humana por sesión)

## ADDED Requirements

### Requirement: Gestión de secretos de tenant por sesión y membership
El sistema DEBE ofrecer endpoints humanos (bajo la sesión autenticada del CRM, no el token de
operador) para leer el estado, guardar, borrar y probar los secretos de un negocio, autorizando cada
operación por la `Membership` del usuario autenticado sobre el `:businessId` indicado en la ruta y
por su rol (`ADMIN` o `MANAGER`). El sistema NO DEBE devolver ni loguear el valor de ningún secreto,
ni al propio dueño del negocio.

Los secretos gestionables son un catálogo fijo de 5 slots (`OPENAI_API_KEY`, `GEMINI_API_KEY`,
`ANTHROPIC_API_KEY` como `BACKEND_SECRET`; `GOOGLE_MAPS_API_KEY` como `FRONTEND_PUBLIC` con
`envVarName = NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; `DATABASE_URL` como `BACKEND_SECRET`). El `scope` y el
`envVarName` de cada slot los fija el servidor; el cliente no puede definirlos.

#### Scenario: Lectura de estado sin exponer valores
- **Given** un usuario autenticado con `Membership` `ADMIN` o `MANAGER` sobre un negocio
- **When** llama a `GET /tenant-keys/:businessId/secrets`
- **Then** el sistema responde 200 con los 5 slots del catálogo (`name`, `label`, `scope`,
  `envVarName`, `configured`, `updatedAt`), sin incluir en ningún caso el valor cifrado ni descifrado

#### Scenario: Alta o actualización de un slot del catálogo
- **Given** un usuario `ADMIN`/`MANAGER` miembro del negocio
- **When** llama a `PUT /tenant-keys/:businessId/secrets/:name` con `{ value }` para uno de los 5
  nombres del catálogo
- **Then** el sistema cifra el valor y hace upsert del `TenantSecret` con el `scope`/`envVarName`
  fijados por el catálogo, y responde 200 con el estado (`configured: true`) sin devolver el valor

#### Scenario: Nombre fuera del catálogo
- **Given** un `:name` que no es ninguno de los 5 slots
- **When** el usuario llama a `PUT`/`DELETE`/`POST .../test` sobre ese `:name`
- **Then** el sistema responde 404 `unknown_secret` sin cifrar, borrar ni probar nada

#### Scenario: Value inválido en el alta
- **Given** un `PUT` con `value` ausente, vacío, o con `\r`/`\n`
- **When** el sistema valida el body
- **Then** responde 422 `invalid` sin persistir

#### Scenario: Borrado de un slot
- **Given** un `TenantSecret` existente para `(businessId, name)` del catálogo
- **When** el usuario `ADMIN`/`MANAGER` miembro llama a `DELETE /tenant-keys/:businessId/secrets/:name`
- **Then** el sistema elimina la fila (hard delete) y ese slot pasa a `configured: false`; si no
  existía la fila, responde 404 `secret_not_found`

### Requirement: Aislamiento cross-tenant por membership del path
El sistema DEBE resolver el `businessId` de cada operación exclusivamente a partir del `:businessId`
de la ruta validado contra la `Membership` del usuario autenticado, de modo que un usuario no pueda
leer ni modificar los secretos de un negocio del que no es miembro.

#### Scenario: Usuario no miembro del negocio del path
- **Given** un usuario autenticado sin `Membership` sobre el negocio B
- **When** llama a cualquier endpoint `/tenant-keys/B/secrets[...]`
- **Then** el sistema responde 404 sin exponer ni modificar dato alguno de B

#### Scenario: Rol insuficiente
- **Given** un usuario con `Membership` `EMPLOYEE` o `CLIENT` sobre el negocio del path
- **When** llama a cualquiera de los endpoints
- **Then** el sistema responde 403 `forbidden`, evaluando el rol sobre la `Membership` del
  `:businessId` del path (no sobre el negocio activo de la sesión)

### Requirement: Prueba de conexión de un secreto sin fuga
El sistema DEBE permitir probar, antes o después de guardarlo, que un secreto funciona realmente
contra su recurso (proveedor de IA o base de datos), sin devolver ni loguear el valor probado ni la
respuesta cruda. El sistema DEBE limitar la frecuencia de pruebas por negocio y slot.

#### Scenario: Prueba de un valor aún no guardado
- **Given** un usuario `ADMIN`/`MANAGER` miembro y un `value` en el body para un slot del catálogo
- **When** llama a `POST /tenant-keys/:businessId/secrets/:name/test`
- **Then** el sistema prueba ese `value` (sin persistirlo) vía `testProviderConnection` y responde
  200 `{ ok, detail? }`; un rechazo del recurso es `ok: false`, no un error HTTP

#### Scenario: Prueba del secreto ya guardado
- **Given** un `TenantSecret` guardado para el slot y ningún `value` en el body
- **When** el usuario llama a `POST .../test`
- **Then** el sistema descifra el secreto, lo prueba y responde `{ ok, detail? }` sin exponer el valor

#### Scenario: Sin valor que probar
- **Given** un slot sin `TenantSecret` guardado y sin `value` en el body
- **When** el usuario llama a `POST .../test`
- **Then** el sistema responde 404 `no_value`

#### Scenario: Límite de intentos por secreto
- **Given** 5 llamadas ya consumidas a `POST .../test` para el mismo negocio y slot en la ventana
- **When** llega una 6ª llamada dentro de esa ventana
- **Then** el sistema responde 429 sin contactar al recurso

#### Scenario: Confirmación de propagación runtime para Google Maps
- **Given** un valor `GOOGLE_MAPS_API_KEY` recién guardado
- **When** la superficie humana confirma el cambio vía `GET /tenant-config` (auth dual sesión +
  `x-business-id`)
- **Then** el sistema expone `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` con el valor
  propagado, sin necesidad de rebuild ni de emitir una `TenantApiKey` desechable
