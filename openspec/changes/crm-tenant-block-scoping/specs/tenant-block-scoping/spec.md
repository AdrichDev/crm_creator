# tenant-block-scoping Specification

## Purpose

Capacidad front-only que acota el bloqueo visual del kill switch de negocio al `businessId`
afectado, exime las superficies de plataforma OperaOS (shell) de cualquier bloqueo, y
reconcilia el estado al cambiar de negocio activo. No modifica el contrato del gate del
backend (`tenant-gate.ts`, códigos 423/410 sin cambios).

## Requirements

### Requirement: Store de bloqueo con alcance de negocio

El store `blocked-state.ts` DEBE representar el bloqueo como
`{ variant: 'suspended' | 'terminated'; businessId: string } | null` (antes
`TenantBlockedVariant | null`, sin `businessId`). DEBE exponer `getTenantBlocked()`,
`setTenantBlocked(value)` y `reconcileTenantBlock(activeBusinessId)`; esta última DEBE poner
el estado a `null` cuando el `businessId` almacenado difiere del `activeBusinessId` recibido.

#### Scenario: Guardar y leer bloqueo con businessId
- GIVEN el store vacío (`null`)
- WHEN se llama `setTenantBlocked({ variant: 'suspended', businessId: 'biz-A' })`
- THEN `getTenantBlocked()` devuelve `{ variant: 'suspended', businessId: 'biz-A' }`

#### Scenario: Reconciliar limpia bloqueo de otro negocio
- GIVEN un bloqueo activo con `businessId: 'biz-A'`
- WHEN se llama `reconcileTenantBlock('biz-B')`
- THEN el store queda en `null`

### Requirement: Interceptor con allowlist de rutas de plataforma

El interceptor de `client.ts` (usado por `apiFetch`, `apiFetchBlob`, `apiUpload`) DEBE
clasificar cada request por prefijo de ruta antes de reaccionar a un 423/410. Las rutas con
prefijo `/auth`, `/tenant-status`, `/tenant-config` o `/service/operator` NUNCA DEBEN llamar a
`setTenantBlocked`, sin importar el código de estado devuelto. Cualquier otra ruta que
devuelva 423 `tenant_suspended` o 410 `tenant_terminated` DEBE llamar a `setTenantBlocked` con
el `variant` derivado del código y el `businessId` igual al `x-business-id` enviado en esa
request.

#### Scenario: Ruta de plataforma no dispara bloqueo
- GIVEN `apiFetch('/auth/me')` devuelve 423 `tenant_suspended`
- WHEN el interceptor procesa la respuesta
- THEN `getTenantBlocked()` sigue siendo `null`

#### Scenario: Ruta de negocio dispara bloqueo con su businessId
- GIVEN `apiFetch('/customers')` con `x-business-id: biz-A` devuelve 423 `tenant_suspended`
- WHEN el interceptor procesa la respuesta
- THEN `getTenantBlocked()` devuelve `{ variant: 'suspended', businessId: 'biz-A' }`

### Requirement: Overlay visible solo para el negocio activo bloqueado

`tenant-block-overlay.tsx` DEBE leer el store y renderizar la pantalla de bloqueo solo cuando
`blocked !== null` Y `blocked.businessId === getActiveBusinessId()`. En cualquier otro caso
(incluido un negocio activo distinto) DEBE renderizar `null`.

#### Scenario: Overlay se monta viendo el negocio bloqueado
- GIVEN `getTenantBlocked()` devuelve `{ variant: 'suspended', businessId: 'biz-A' }`
- AND `getActiveBusinessId()` devuelve `'biz-A'`
- WHEN el overlay renderiza
- THEN muestra la pantalla de bloqueo variante `suspended`

#### Scenario: Overlay no se monta para negocio distinto
- GIVEN `getTenantBlocked()` devuelve `{ variant: 'suspended', businessId: 'biz-A' }`
- AND `getActiveBusinessId()` devuelve `'biz-B'`
- WHEN el overlay renderiza
- THEN renderiza `null`

### Requirement: Reconciliación al cambiar de negocio activo

`openProject(id)` (`tenant-config-context.tsx`) DEBE llamar a `reconcileTenantBlock(id)`
inmediatamente después de fijar el nuevo negocio activo, para que un bloqueo obsoleto del
negocio anterior no persista contra el negocio recién activado.

#### Scenario: Cambiar a negocio sano limpia el bloqueo
- GIVEN un bloqueo activo para `biz-A` y el usuario cambia a `biz-B` vía `openProject('biz-B')`
- WHEN `reconcileTenantBlock('biz-B')` se ejecuta
- THEN `getTenantBlocked()` pasa a `null` y el overlay se desmonta sin recargar la página
