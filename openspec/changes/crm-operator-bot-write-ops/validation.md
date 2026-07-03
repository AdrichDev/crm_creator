# Validation: crm-operator-bot-write-ops

## Historia de usuario

Como bot de chat operado por la plataforma, quiero poder listar/crear clientes, facturas
y ventas, y listar tenants, autenticándome con un token de servicio (no una sesión de
usuario), para que estas operaciones funcionen en modo real sin depender de un JWT humano.

## Criterios de aceptación

- AC1: `GET/POST /service/operator/customers`, `/invoices`, `/sales` responden 200/201
  con `x-service-token` válido y `businessId` existente/activo; 401 sin token o token
  incorrecto; 404/422 si `businessId` no existe o está soft-borrado.
- AC2: `GET /service/operator/tenants` lista tenants activos con el mismo token.
- AC3: `CrmClient.createProject()` pega a `/service/operator/proyectos` (no a `/api/projects`).
- AC4: los 8 métodos de `CrmClient` compilan y usan `requestOperator()` (no `request()`
  con Bearer) — cero regresión en el shape de retorno que consumen `ops-runner.ts` /
  `ops/resolve.ts` / `ops/dedup.ts`.
- AC5: rutas `/api/*` equivalentes siguen intactas (front de usuario no se toca).

## Escenario Given-When-Then

- Given un negocio activo con `businessId` conocido
- When el bot llama `POST /service/operator/sales` con `x-service-token` válido y
  `{ businessId, cliente, total }`
- Then responde 201 con `{ id }` y la venta existe en `crm.venta` con ese `businessId`.

## Tests por tarea

| Tarea | Test | Estado |
|---|---|---|
| T1 rutas back (tenants/customers/invoices/sales) | 200/201 camino feliz + 401 sin token + 404/422 businessId inválido, por cada ruta | pendiente |
| T2 CrmClient re-apuntado | typecheck limpio; tests unitarios del cliente (si existen) o smoke manual documentado | pendiente |
| T3 regresión /api/* | suites existentes de customers/sales/invoices/tenants/projects siguen verdes | pendiente |
