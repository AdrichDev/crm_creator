# Validación — crm-portal-cliente

Historia: como **cliente logueado** quiero ver un portal propio (mis citas, catálogo para
reservar) consumiendo `/me/*` en lugar de los endpoints de staff que ahora me devuelven 403,
para dejar de ver paneles vacíos.

## Criterios de aceptación (AC)
- **AC1 (decisión A = SÍ):** el cliente puede LEER el catálogo de servicios/productos/locations
  (GET 200); la escritura sigue siendo solo staff (POST → 403).
- **AC2:** el front del rol `cliente` deja de pegar a endpoints de staff y consume `/me/*`;
  "Mis citas" se sirve vía `/me/bookings` remapeado a la forma `Cita`.
- **AC3:** `ROLE_MODULES.cliente = [citas, servicios, productos, configuracion]` (sin
  dashboard/facturas); `canWrite` del cliente = solo `configuracion`.
- **AC4 (decisión B = NO):** las facturas quedan fuera del portal por ahora (sin migración
  `invoice.customerId`).
- **AC5:** el catálogo expuesto no contiene PII → seguro exponerlo en lectura al cliente.

## Por tarea (Given-When-Then + test)
- **1.1/1.2 data layer** → Given rol cliente, When `apiBackend.list('citas')`, Then
  `/me/bookings` mapeado; staff-only → `[]`; escrituras no-op. Test: front unit.
- **2.1/2.2 catálogo RBAC** → Given CLIENT, When GET servicios/productos/locations, Then 200;
  When POST, Then 403. Test: back `staffOrClient` (suite 51/51 verde).
- **1.5 bonos/perfil** → DIFERIDO: no existe módulo `bonos` (registro de módulos fijo) y
  "Configuración" muestra config local, no `/me/profile`. Endpoints `/me/packages` y
  `/me/profile` ya listos en back; requieren añadir módulo/página (fase posterior).

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado — IMPLEMENTADO (parcial; bonos/perfil-view diferidos)
- Front `tsc` limpio + `npm test` 67 verdes. ✓
- Back catálogo test verde (suite 51/51); reaudit: catálogo sin PII → lectura cliente segura. ✓
- **V.3 PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO:** flujo manual cliente (login → ve sus
  citas + catálogo, sin 403) con un CRM generado real — sin verificación registrada aún.
- Diferido (fase posterior): "Mis bonos" y "Mi perfil" dedicados (falta módulo/página).
- Fuera de alcance: facturas del cliente (decisión B = NO, sin migración `invoice.customerId`).
