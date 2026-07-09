# Spec delta — Capacidad: API keys y secretos por negocio

## ADDED Requirements

### Requirement: API key portador por negocio
El sistema DEBE permitir emitir credenciales portador (`TenantApiKey`) asociadas a un
negocio. El valor en claro DEBE mostrarse una sola vez al emitir; en almacenamiento solo
DEBE persistir su hash SHA-256. El sistema DEBE poder revocar y rotar claves.

#### Scenario: Emisión muestra el token una vez
- **Given** un operador autenticado por service token
- **When** emite una API key para un negocio
- **Then** la respuesta incluye el token en claro una única vez y en BD solo queda su hash

#### Scenario: Clave revocada no autentica
- **Given** una API key con `revokedAt` establecido
- **When** una app la presenta al back
- **Then** el sistema responde 401 `invalid_api_key`

### Requirement: Resolución de negocio por API key
El sistema DEBE resolver el `businessId` a partir de una `TenantApiKey` válida sin usar la
sesión de usuario del panel, y DEBE rechazar con 401 cualquier clave ausente, inválida o
revocada.

#### Scenario: Clave válida resuelve negocio
- **Given** una API key activa de un negocio
- **When** una petición la presenta como portador
- **Then** el back opera con el `businessId` de esa clave y actualiza `lastUsedAt`

### Requirement: Secretos por negocio con scope
El sistema DEBE almacenar secretos por negocio (`TenantSecret`) cifrados AES-256-GCM a
nivel de aplicación, con un `scope` de `FRONTEND_PUBLIC` o `BACKEND_SECRET` y un
`keyVersion` que permita rotar la clave maestra.

#### Scenario: Rotación de clave maestra
- **Given** un secreto cifrado con `keyVersion=1`
- **When** se rota la clave maestra a la versión 2
- **Then** el secreto sigue descifrándose sin necesidad de re-emitirlo

### Requirement: Configuración pública tenant-facing
El sistema DEBE ofrecer un endpoint `GET /tenant-config` autenticado por `TenantApiKey`
que devuelva únicamente los secretos `scope=FRONTEND_PUBLIC` y flags de configuración. Los
secretos `scope=BACKEND_SECRET` NO DEBEN servirse por HTTP en ninguna respuesta.

#### Scenario: Backend secret nunca se sirve
- **Given** un negocio con un secreto `BACKEND_SECRET` y otro `FRONTEND_PUBLIC`
- **When** una app llama a `GET /tenant-config` con su API key
- **Then** la respuesta incluye el `FRONTEND_PUBLIC` y nunca el `BACKEND_SECRET`
