# Proposal — Portal del cliente (front consume /me/*)

**Nivel Gru: 3 — Grande** (front multi-vista + posible relajación RBAC de catálogo + posible migración facturas).
**Estado: SPEC.** Continúa `crm-autoregistro-cliente` (auth + RBAC ya cerrados).

## Contexto
Tras el fix de seguridad, el rol `CLIENT` recibe **403** en los endpoints de staff
(`/customers,/bookings,/services,/invoices,/dashboard,...`). El front del rol `cliente`
(`ROLE_MODULES.cliente = [dashboard,citas,servicios,productos,facturas,configuracion]`) usa
`apiBackend.list(key)` → esos endpoints → ahora devuelven 403 → paneles vacíos. El cliente
autenticado **no ve nada suyo**. El back ya expone `/me/profile`, `/me/bookings`, `/me/packages`.

## Intención
Que un cliente logueado vea un **portal propio**: su perfil, sus citas, sus bonos; y pueda
**reservar** (lo que requiere leer el catálogo de servicios). El front del rol `cliente` deja de
pegar a endpoints de staff y consume `/me/*` (+ catálogo de solo lectura si se aprueba).

## Análisis (clasificación de endpoints)
| Tipo | Endpoints | Acceso cliente |
|---|---|---|
| Privado del cliente | sus citas, bonos, perfil | `/me/*` (ya existe) |
| Catálogo (para reservar) | services, products, locations | **decisión A** (lectura sí/no) |
| Facturas del cliente | invoices | **decisión B** (requiere `invoice.customerId`) |
| Staff-only | customers, employees, sales, dashboard, campaigns, fichajes | denegado (correcto) |

## Decisiones a tomar (forks de producto)
- **A — Catálogo**: ¿el cliente puede LEER servicios/productos (para reservar)? Si sí → relajar a GET de
  catálogo (allowlist) o endpoints `/me/catalog`. Si no → portal cerrado solo a `/me/*` (no reserva online aún).
- **B — Facturas**: ¿el cliente ve SUS facturas ahora? Requiere migración `invoice.customerId` + scoping en `/me/invoices`.
  Alternativa: dejar facturas fuera del portal por ahora.
- **C — Vistas del portal**: set mínimo = Mi perfil + Mis citas + Mis bonos. (Catálogo/Reserva y Facturas según A/B.)

## Fuera de alcance
- Crear/cancelar citas online por el cliente (reserva self-service) — fase posterior.
- Pagos.

## Ruteo (Gru)
Nivel 3 → architect ligero + spec (este) + builder por unidades + tester + reviewer. Sin Ruflo salvo que
A+B disparen migración + cambios transversales (entonces Nivel 4 → human approval para la migración).
