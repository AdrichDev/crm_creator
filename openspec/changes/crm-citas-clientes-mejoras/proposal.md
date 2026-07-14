# Proposal — crm-citas-clientes-mejoras

## Intent
Mejoras del flujo de citas y de la ficha de cliente en el CRM (paridad futura con AA).
Seis items pedidos por el usuario; se implementan en CRM primero (S1–S4), luego se porta a AA.

## Scope (CRM)
- **S1 (item 1)** Prefill de fecha: al seleccionar un día en la agenda y pulsar "Añadir",
  el form de nueva cita abre con esa fecha (editable). `AgendaGrid.onSelectedChange` →
  `NuevaCitaModal.fechaInicial`.
- **S2 (item 4 + 5)** Nombre comercial: columna nueva `Customer.nombreComercial` (aditiva).
  La lista de clientes muestra el nombre comercial (fallback razón social → persona); la
  razón social queda solo en ficha/edición. Contactos ya muestran el nombre del contacto.
- **S3 (item 6)** Picker de cita con dos grupos: Clientes (empresa, por nombre comercial) y
  Contactos/leads (por nombre). Una cita puede ser de un `Customer` O de un `Contacto` →
  `Booking.contactoId` (FK opcional, XOR con customerId/teamId).
- **S4 (item 2)** Recurrencia: puntual / diaria / mensual / anual. Modelo elegido por el
  usuario: **generar N ocurrencias acotadas** (una reserva real por ocurrencia hasta un
  horizonte/fecha-fin), no una regla expandida al vuelo. Encaja con el sync de Google
  actual (1 cita = 1 evento) y la disponibilidad sin reescribir esas capas.

## Out
- Item 3 (huecos por profesional): ya funciona en CRM (`HoraChips`). AA: se deja cosmético
  por decisión del usuario (AA no tiene agenda por empleado).
- Migraciones a prod: `migrate deploy` aparte (aditivas, sin DROP).

## Risks
- Dos migraciones aditivas (nombreComercial, contactoId FK). Sin DROP → reversibles/seguras.
- S4 generación N: acotar el horizonte para no crear cientos de filas en "anual".

## Dependencies
- `Location.zonaHoraria` / `Customer.razonSocial` (existentes). `Contacto` (existente).
