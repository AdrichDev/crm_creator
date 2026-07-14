# Tasks — crm-citas-clientes-mejoras (CRM)

- [x] S1 Prefill fecha: `AgendaGrid.onSelectedChange` → `NuevaCitaModal.fechaInicial`.
      Verify: front tsc. GREEN.
- [x] S2 nombreComercial: schema + migración `customer_nombre_comercial` + `customers.ts`
      (INPUT, shapeCustomer, sortable) + lista/ficha/edición clientes + tipo mock.
      Verify: back tsc + customer tests; front tsc + clientes tests (14). GREEN.
- [x] S3 cita↔contacto: schema `Booking.contactoId` + migración `booking_contacto_id` +
      `tenant.ts` (TenantModel 'contacto') + `bookings.ts` (XOR triple, assertFks, create,
      shaping cliente/clienteComercial) + picker 2 grupos en el modal.
      Verify: back tsc + tenant (22); front tsc + modal/citas (27). GREEN. (bookings route
      tests e2e → skipped, requieren DB.)
- [ ] S4 recurrencia (generar N acotadas): schema (agrupación de serie en Booking) +
      migración + generación por ocurrencia con chequeo de disponibilidad + campo UI
      puntual/diaria/mensual/anual + horizonte. Verify: back tsc + tests + front tsc.

## Deploy / migraciones (HITL)
- `cd back && npm run migrate:deploy` aplica `customer_nombre_comercial` + `booking_contacto_id`.
- Verificar con `prisma migrate status` (código mergeado ≠ aplicado).

## Follow-up (AA)
- Portar S1/S2/S4 y el picker agrupado (S3 sin FK: AA guarda cliente como texto). Item 3 cosmético.
