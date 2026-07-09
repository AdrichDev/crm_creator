# crm-tenant-api-keys

## Intención
Establecer la **fundación de superficie tenant-facing** del CRM: un mecanismo de
**API keys por negocio** (server-to-server, portador) para que apps y superficies
externas de un tenant (landing generada, app alquilada, integraciones) hablen con el
back sin sesión de usuario, y un **almacén de secretos por negocio** cifrado a nivel de
aplicación (AES-256-GCM) con separación estricta entre lo que es público de frontend y
lo que jamás sale del servidor.

Es la base sobre la que se montan `crm-tenant-lifecycle-gate` (kill switch) y
`crm-ai-proxy` (IA medida): ambos necesitan resolver "qué negocio es" a partir de una
credencial portador, no de un JWT de Supabase.

## Problema
Hoy el back del CRM tiene dos formas de autenticación:
- **Sesión de usuario** (JWT Supabase, `authenticate` + `rbac`) para el panel.
- **Service token único de operador** (`OPERATOR_SERVICE_TOKEN`, `requireOperatorToken`)
  para el Operator Agent, que opera **sobre cualquier negocio** (ver memoria
  "Bot sin scoping de tenant — riesgo").

No existe una credencial **por negocio** que una app externa del tenant pueda portar
sin arrastrar la sesión del panel, ni un lugar seguro donde ese tenant guarde secretos
(claves de terceros, flags de frontend). Sin esto, cualquier superficie tenant-facing
tendría que reusar el token de operador (sin scoping) o exponer secretos en el cliente.

## Alcance
- **A. Modelo de datos (aditivo, schema `crm`):**
  - `TenantApiKey`: credencial portador por negocio. Se persiste **solo el hash**
    SHA-256 del token; el valor en claro se muestra **una única vez** al emitir.
  - `TenantSecret`: par nombre→valor cifrado por negocio, con `scope`
    (`FRONTEND_PUBLIC` | `BACKEND_SECRET`), cifrado AES-256-GCM con `keyVersion` para
    rotación de clave sin re-emitir.
- **B. Middleware `resolveTenantApiKey`:** valida el header portador, resuelve el
  `businessId`, actualiza `lastUsedAt`, rechaza clave inválida/revocada con 401.
- **C. Endpoint tenant-facing `GET /tenant-config`:** autenticado por `TenantApiKey`.
  Devuelve **solo** los secretos `scope=FRONTEND_PUBLIC` + flags de configuración. Los
  `BACKEND_SECRET` **jamás** se sirven por HTTP: solo los lee el back server-side.
- **D. Endpoints de operador** (bajo `/service/operator`, `requireOperatorToken`):
  emitir clave (token en claro una vez), rotar clave, revocar clave, alta y rotación de
  secreto por negocio.

## Fuera de alcance
- Kill switch / estados de negocio (→ `crm-tenant-lifecycle-gate`).
- Proxy de IA y metering (→ `crm-ai-proxy`, `crm-metering-core`).
- Rate-limiting por clave, cuotas o rotación automática programada (posible iteración).
- UI de autoservicio para que el propio tenant gestione sus claves (por ahora las emite
  el operador).

## Decisiones
- **Solo se guarda el hash (SHA-256), nunca el token en claro.** El valor se enseña una
  vez al emitir; si se pierde, se rota (no se recupera). Igual filosofía que un PAT.
- **`prefix` de 8 chars visibles** (no secreto) para identificar la clave en listados y
  logs sin exponer el secreto completo. El lookup se hace por hash del token completo.
- **Comparación por hash con índice único**, no `timingSafeEqual` byte a byte: el token
  se hashea (SHA-256) y se busca el hash en columna `@unique`; un hash no revela timing
  del secreto. (El operador sigue con `timingSafeEqual` en su token estático.)
- **Dos scopes, una tabla.** `FRONTEND_PUBLIC` = servible al cliente (p. ej. clave
  pública de un mapa, feature flag). `BACKEND_SECRET` = solo server-side (p. ej. clave
  de un proveedor). La frontera la impone `GET /tenant-config`, que filtra por scope.
- **Cifrado AES-256-GCM a nivel de app** reutilizando el patrón probado de
  `back/src/lib/crypto.ts` (mismo esquema iv/authTag), con **clave propia**
  `SECRETS_MASTER_KEY` (distinta de `CRM_OAUTH_ENCRYPTION_KEY` para contener el blast
  radius) y `keyVersion` persistido por fila para permitir rotación de clave maestra.
- **Emisión y gestión solo por operador** en esta primera tanda: la superficie
  tenant-facing consume, no administra.

## Riesgos
- **Fuga de `SECRETS_MASTER_KEY`** compromete todos los `TenantSecret`. Mitigación:
  clave solo en env de servidor, `keyVersion` para rotación, y separación de la clave
  OAuth existente.
- **Clave portador filtrada** da acceso al negocio hasta revocarla. Mitigación:
  revocación inmediata (`revokedAt`), `lastUsedAt` para detectar uso anómalo, `prefix`
  para identificar cuál rotar.
- **Confusión de scope** (marcar un secreto sensible como `FRONTEND_PUBLIC`). Mitigación:
  `scope` obligatorio y explícito al alta; `GET /tenant-config` nunca sirve
  `BACKEND_SECRET` aunque el operador se equivoque de nombre.

## Rollback
Migración aditiva (solo CREATE): revertible con DROP de `tenant_api_key`/`tenant_secret`
sin tocar datos existentes. El middleware es opt-in por ruta; ninguna ruta existente
cambia de auth.

## Dependencias
- Prisma 7 + Supabase schema `crm`, patrón `@map` castellano.
- `requireOperatorToken` (`back/src/middleware/operator-token.ts`) para el router de
  operador.
- Patrón de cifrado de `back/src/lib/crypto.ts` (AES-256-GCM).
- Consumida por `crm-tenant-lifecycle-gate` y `crm-ai-proxy`.

## Criterios de éxito
- Una app externa con una `TenantApiKey` válida obtiene su config pública y nada más;
  con clave revocada/ausente recibe 401.
- Ningún secreto `BACKEND_SECRET` es servible por HTTP en ninguna respuesta.
- El token en claro se muestra exactamente una vez (al emitir) y no se persiste.
- back tests verde, `tsc` limpio, `prisma migrate status` sin drift.
