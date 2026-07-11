# Spec delta — Capacidad: Ciclo de vida y kill switch por negocio

Delta sobre `openspec/changes/crm-tenant-lifecycle-gate/specs/tenant-lifecycle/spec.md`
(cambio origen del gate, aún sin archivar). Este delta NO modifica `tenant-gate.ts`, los
códigos 423/410 ni las exenciones existentes; acota el bootstrap de identidad y el bloqueo
visual del cliente al negocio afectado.

## MODIFIED Requirements

### Requirement: Gate de servicio server-authoritative

El sistema DEBE aplicar un gate en cada request tenant/panel que deniegue servicio según el
estado efectivo del negocio, con caché in-process corta invalidada en cada transición. El
bootstrap de identidad (`GET /api/auth/me`) NO DEBE aplicar el gate duro (423/410): SIEMPRE
responde 200 con `user`, `memberships[]`, `activeBusinessId` y `lifecycle` del negocio activo.
El campo `business` (configuración operable) DEBE ser `null` cuando ese `lifecycle` no es
`ACTIVE` ni `GRACE`, y DEBE estar presente cuando sí lo es. El resto de rutas tenant/panel
(datos de negocio, `/api/me/*` de cliente) SIGUEN sujetas al gate sin cambios.
(Previously: el gate cubría "cualquier request tenant/panel, incluido login" sin excepción
para el bootstrap de identidad, por lo que un negocio SUSPENDED/TERMINATED devolvía 423/410
también en `/api/auth/me`.)

#### Scenario: Negocio suspendido en ruta de datos
- **Given** un negocio `SUSPENDED`
- **When** llega un request a una ruta tenant/panel de datos (no identidad)
- **Then** el sistema responde 423 `tenant_suspended`

#### Scenario: Negocio terminado en ruta de datos
- **Given** un negocio `TERMINATED`
- **When** llega un request a una ruta tenant/panel de datos
- **Then** el sistema responde 410 `tenant_terminated`

#### Scenario: Gracia vigente
- **Given** un negocio `GRACE` con `graceUntil` futuro
- **When** llega un request
- **Then** pasa y la respuesta incluye header `x-tenant-grace-until`

#### Scenario: Gracia expirada (perezosa)
- **Given** un negocio `GRACE` con `graceUntil` pasado
- **When** llega un request
- **Then** el gate lo trata como `SUSPENDED` (423) sin escribir el estado

#### Scenario: Identidad siempre alcanzable
- **Given** el negocio activo está `SUSPENDED` o `TERMINATED`
- **When** el front llama `GET /api/auth/me`
- **Then** responde 200 con `memberships[]` y `activeBusinessId`, `business: null` y
  `lifecycle` igual al estado real (nunca 423/410)

### Requirement: Pantalla de bloqueo en el cliente

El front DEBE interceptar las respuestas 423 `tenant_suspended` y 410 `tenant_terminated` de
rutas de negocio (panel/datos) y mostrar una pantalla de bloqueo, consultando
`GET /tenant-status` para explicar el motivo (410 → variante "cuenta cerrada"). El bloqueo
DEBE acotarse al `businessId` que originó el 423/410: NO DEBE cubrir rutas de plataforma
(login, `/auth/me`, `/tenant-status`, `/tenant-config`, listado/selector de negocios,
`/service/operator`) ni negocios distintos del que devolvió el error.
(Previously: interceptación global sin `businessId` — cualquier 423/410 de cualquier request
cubría toda la aplicación, incluidas las rutas de plataforma.)

#### Scenario: Bloqueo se ciñe al negocio afectado
- **Given** el negocio activo `biz-A` está `SUSPENDED` y el usuario ve el panel de `biz-A`
- **When** una request de panel (p. ej. `/customers`) devuelve 423 `tenant_suspended`
- **Then** la pantalla de bloqueo se monta acotada a `biz-A`

#### Scenario: Rutas de plataforma nunca bloquean
- **Given** el negocio activo `biz-A` está `SUSPENDED`
- **When** el shell llama `/api/auth/me` o el usuario abre el selector de negocios
- **Then** no se monta ninguna pantalla de bloqueo y el shell sigue operable

#### Scenario: Cambio de negocio activo limpia bloqueo obsoleto
- **Given** la pantalla de bloqueo está montada para `biz-A`
- **When** el usuario cambia el negocio activo a `biz-B` (sano)
- **Then** la pantalla se desmonta sin recarga de página
