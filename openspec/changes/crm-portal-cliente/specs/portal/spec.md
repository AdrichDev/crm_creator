# Spec — Portal del cliente

## UC-1 — El cliente ve su perfil
**WHEN** un usuario con rol `cliente` abre su portal
**THEN** ve su `firstName`, email, username y teléfono desde `GET /api/me/profile`.

- AC-1.1 No se muestran datos de otros usuarios/clientes.
- AC-1.2 Si el backend no está configurado, el portal indica modo no disponible (sin romper).

## UC-2 — El cliente ve sus citas
**WHEN** el cliente abre "Mis citas"
**THEN** ve solo sus reservas desde `GET /api/me/bookings` (resueltas por su `Customer` vía email).

- AC-2.1 Si no tiene ficha de `Customer` asociada → lista vacía con mensaje "aún no tienes citas".
- AC-2.2 Nunca aparecen citas de otros clientes.

## UC-3 — El cliente ve sus bonos
**WHEN** el cliente abre "Mis bonos"
**THEN** ve sus `CustomerPackage` desde `GET /api/me/packages`.

- AC-3.1 Lista vacía si no tiene bonos.

## UC-4 — El front del rol cliente no pega a endpoints de staff
**WHEN** el front resuelve los datos del rol `cliente`
**THEN** usa `/me/*` (y catálogo de solo lectura si UC-5), nunca `/customers`, `/employees`, `/sales`, `/dashboard`, ni el listado completo de `/invoices`.

- AC-4.1 No se producen 403 visibles por llamadas indebidas; el rol `cliente` solo invoca endpoints permitidos.
- AC-4.2 Los roles `admin`/`trabajador` siguen usando los endpoints de staff como hasta ahora.

## UC-5 — Catálogo para reservar  [condicionado a Decisión A]
**WHEN** el cliente quiere reservar
**THEN** puede LEER el catálogo de servicios (y productos) en modo solo lectura.

- AC-5.1 (si A=sí) `cliente` puede `GET` servicios/productos del negocio; NO puede crear/editar/borrar.
- AC-5.2 (si A=no) el portal no muestra catálogo ni reserva online (fase posterior).

## UC-6 — Facturas del cliente  [condicionado a Decisión B]
**WHEN** el cliente abre "Mis facturas"
**THEN** ve solo SUS facturas.

- AC-6.1 (si B=sí) requiere `Invoice.customerId`; `GET /api/me/invoices` filtra por su `Customer`.
- AC-6.2 (si B=no) "Mis facturas" no aparece en el portal del cliente por ahora.
