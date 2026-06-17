# Design — Portal del cliente

**Nivel Gru: 3.** Alineado con `proposal.md` / `specs/portal/spec.md`. Continúa `crm-autoregistro-cliente`.

## 0. Base real
- Back ya expone `/me/profile`, `/me/bookings`, `/me/packages` (router montado antes de `staffOnly`).
- Front: `lib/data/backend.ts` → `apiBackend.list(key)` mapea `key→endpoint` (`citas→/bookings`, ...) sin
  conciencia de rol. `ROLE_MODULES.cliente=[dashboard,citas,servicios,productos,facturas,configuracion]`.
  Rol persistido en `localStorage 'saas.role.v1'`. `useRole()` en `tenant-config-context`.

## 1. Front — remapeo por rol (UC-4)
`lib/api/me.ts` (nuevo): `getMyProfile()`, `getMyBookings()`, `getMyPackages()` (+ `getMyInvoices()` si B).
En `apiBackend.list(key)`: si el rol activo es `cliente`:
- `citas` → `/me/bookings`; `bonos/packages` → `/me/packages`.
- claves staff-only (`clientes,empleados,ventas,fichaje,vacaciones,marketing`) → devolver `[]` sin llamar (evita 403).
- `servicios,productos` → catálogo (Decisión A): si A=sí, `GET` normal (lectura); si A=no, `[]`.
- `facturas` → Decisión B: si B=sí `/me/invoices`; si B=no `[]` y se oculta el módulo para cliente.
Para create/update/remove con rol `cliente` → no-op (el cliente no escribe; UI ya oculta acciones).

> Lectura del rol en el backend del front: `localStorage.getItem('saas.role.v1')` (mismo origen que `useRole`).

## 2. Vistas del portal (UC-1..3)
Reusar los paneles existentes con datos remapeados, o un set reducido. Mínimo:
- "Mis citas" (panel citas con datos de `/me/bookings`, solo lectura).
- "Mis bonos" (nuevo panel simple sobre `/me/packages`).
- "Mi perfil" (en configuración, datos de `/me/profile`).
Ajustar `ROLE_MODULES.cliente` al set final según A/B.

## 3. Decisión A — catálogo (si aplica)
Relajar `staffOnly` para **GET** de catálogo: mover `services`/`products`/`locations` a un guard
`staffOrClient` que permita GET a `CLIENT` y escritura solo a staff. Implementación: middleware que
si método=GET permite CLIENT; si no, exige staff. Montar esos routers fuera del `staffOnly` global con
ese guard. (Mantener `customers/employees/sales/dashboard` bajo `staffOnly`.)

## 4. Decisión B — facturas del cliente (si aplica)
Migración aditiva: `Invoice += customerId String?` (+ índice). `/me/invoices` filtra por el `Customer`
del usuario. Recipe de migración sin DROP (memoria `crm-prisma-migration-gotcha`). Nivel sube a 4 por la migración.

## 5. Seguridad / reúso
- Reúso: `apiFetch`, `/me/*`, `staffOnly`, `requireRole`. Patrón: routers de datos van tras `staffOnly` salvo
  catálogo (guard `staffOrClient`) y `/me/*`.
- El remapeo del front es defensa en profundidad UX; la autoridad real es el back (403 + scoping `/me`).

## 6. Verificación
- Front `npm test` + flujo manual: login cliente → ve perfil/citas/bonos; no 403 en consola; no ve datos de otros.
- Back: si A → test `CLIENT GET /services 200, POST 403`; si B → test `/me/invoices` scoped + migración aplica.
- Reaudit: confirmar que relajar catálogo no expone datos privados (services/products no llevan PII).
