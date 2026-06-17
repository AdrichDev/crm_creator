# Tasks — crm-portal-cliente   (Nivel 3 — IMPLEMENTADO; bonos/perfil-view diferidos)

## Fase 0 — Decisiones (humano)
- [x] 0.1 Decisión A = **SÍ** (cliente lee catálogo servicios/productos, escritura solo staff).
- [x] 0.2 Decisión B = **NO** por ahora (facturas fuera; sin migración).
- [x] 0.3 Decisión C = Perfil + Citas + Bonos (catálogo incluido por A).

## Fase 1 — Front core
- [x] 1.1 `lib/api/me.ts`: `getMyProfile/getMyBookings/getMyPackages` + `mapBookingStatus`.
- [x] 1.2 `lib/data/backend.ts`: `apiBackend` role-aware — cliente `citas→/me/bookings` (mapeado a forma Cita), staff-only→`[]`, escrituras no-op.
- [x] 1.3 "Mis citas" (solo lectura vía remap) + catálogo servicios/productos (solo lectura). `canWrite` cliente = solo `configuracion` (sin botones de escritura en citas/catálogo).
- [x] 1.4 `ROLE_MODULES.cliente = [citas, servicios, productos, configuracion]` (sin dashboard/facturas).
- [~] 1.5 "Mis bonos" + "Mi perfil" dedicados → DIFERIDO: no existe módulo `bonos` (registro de módulos fijo) y "Configuración" muestra config local, no `/me/profile`. Endpoints `/me/packages` y `/me/profile` ya listos en back. Requiere añadir módulo/página (fase posterior).

## Fase 2 — Catálogo (A=sí)
- [x] 2.1 `middleware/rbac.ts` `staffOrClient` (GET cualquier miembro, escritura staff) + `index.ts` mueve `locations/services/products` antes de `staffOnly` con ese guard.
- [x] 2.2 Test back: `CLIENT GET servicios/productos/locations → 200; POST → 403`. Verde.

## Fase 3 — Facturas (B=no) → fuera de alcance
- [-] 3.x No se implementa (sin migración `invoice.customerId`).

## Verificación
- [x] V.1 Front `tsc` limpio + `npm test` 67 verdes.
- [x] V.2 Back catálogo test verde (suite 51/51). Reaudit: catálogo (services/products/locations) no contiene PII → exponer lectura al cliente es seguro.
- [~] V.3 Flujo manual cliente (login→ve sus citas + catálogo, sin 403) — pendiente vistazo humano con un CRM generado real.
