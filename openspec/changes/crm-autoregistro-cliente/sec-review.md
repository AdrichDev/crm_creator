# Sec-review — RBAC del rol CLIENT (auditoría 2026-06-17)

Auditoría del control de acceso tras introducir el rol `CLIENT` (auto-registro). Read-only sobre `back/src`.

## Resumen
**Estado: NO APTO — hay un hallazgo CRÍTICO abierto.** El rol `CLIENT` (y cualquier usuario
autenticado) puede leer y modificar TODOS los datos del tenant. "Cliente solo vistas" NO está
aplicado en la API; solo en la UI.

## Cómo funciona el control hoy
- `middleware/auth.ts` resuelve `req.role` desde la membership del tenant activo. Correcto:
  invalida sesión por `passwordChangedAt`, bloquea `status='disabled'`, y todo se filtra por `businessId`
  (no hay fuga cross-tenant).
- `middleware/rbac.ts` (`requireRole`) existe y se aplica SOLO en:
  - `routes/users.ts` → `requireRole('OWNER','ADMIN')`. ✓
  - `routes/timeoff.ts` approve/reject → `requireRole('OWNER','ADMIN','MANAGER')`. ✓

## Hallazgos
### F1 — CRÍTICO: `crudRouter` sin guard de rol
`routes/index.ts` monta tras `authenticate` (sin más guard): `locations, employees, customers,
services, resources, products, sales, invoices, campaigns, fichajes, tags`. `lib/crud.ts` NO comprueba
rol en GET/POST/PATCH/DELETE. Impacto con una cuenta `CLIENT` (auto-registrada, gratis):
- **Fuga de PII**: `GET /api/customers` devuelve nombre, teléfono, email, fecha de nacimiento, dirección,
  consentimientos de TODOS los clientes del negocio. Igual con `employees`, `sales`, `invoices`.
- **Integridad**: `POST/PATCH/DELETE` permite crear/editar/**borrar** cualquier registro.
- **Escalada**: un cliente final tiene el mismo poder de datos que un admin (salvo gestión de usuarios).

### F2 — ALTO: custom routers sin guard
`dashboard` (analíticas del negocio), `bookings`, `packages` montados tras `authenticate` sin
`requireRole` → un `CLIENT` ve métricas y opera reservas/bonos del negocio.

### F3 — MEDIO: sin separación lectura/escritura entre roles de staff
`EMPLOYEE` puede borrar lo mismo que `ADMIN` vía crud. Puede ser intencionado; conviene decidir matriz.

### Positivo
`users` y `timeoff` approve/reject protegidos; scoping multi-tenant correcto; invalidación de sesión OK;
`branding` es setup público pre-auth (aceptable).

## Remediación recomendada
1. Definir matriz **rol → capacidad** explícita.
2. Cerrar F1/F2 ya. Dos enfoques:
   - **A (bloqueo duro, recomendado ahora)**: `CLIENT` denegado (403) en todos los routers de datos de
     staff (lectura y escritura). El portal real del cliente (ver SUS citas/facturas) se diseña como
     change aparte con endpoints client-scoped. Cierra la brecha sin construir features nuevas.
   - **B (solo-lectura scoped)**: `CLIENT` puede GET pero filtrado a sus propios datos; requiere
     diseñar el scoping por `customerId`/`userId`. Más trabajo.
3. Añadir test de regresión (CLIENT → 403 en endpoints de staff) como detección permanente.

## Remediación aplicada (2026-06-17)
Enfoque elegido: **B — lectura scoped** con base de **deny-by-default**.
- `middleware/rbac.ts`: `STAFF_ROLES` + `staffOnly` (deniega CLIENT/no-staff).
- `routes/index.ts`: `api.use('/me', meRouter)` ANTES de `api.use(staffOnly)`; todos los crud +
  dashboard/bookings/packages/time-off quedan tras `staffOnly` → **CLIENT recibe 403** (F1 y F2 cerrados).
- `routes/me.ts`: endpoints client-scoped (`/me/profile`, `/me/bookings`, `/me/packages`) que resuelven
  el `Customer` del usuario por email dentro del tenant → el CLIENT solo ve SUS datos (vacío si no tiene ficha).
- Test de regresión (`auth-client-register.e2e`): CLIENT → 403 en customers/employees/invoices/dashboard
  y en escritura; 200 en `/me/*`. Suite back 50/50 verde (sin regresiones en staff).

Pendiente (no bloqueante): cablear el front del CLIENT a `/me/*`; scoping de `invoices` (hoy `cliente`
es string, sin `customerId`) si se quiere exponer facturas al cliente; revisar matriz EMPLOYEE vs ADMIN (F3).

## Veredicto
**APTO-CON-FIXES.** F1/F2 (críticos) cerrados y con detección. F3 (medio, EMPLOYEE=ADMIN en crud) queda
documentado para decisión de producto.
