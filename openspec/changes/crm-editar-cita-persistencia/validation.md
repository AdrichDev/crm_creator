# Validation: crm-editar-cita-persistencia

## User story

Como gestor del negocio, cuando edito una cita (fecha, hora, empleado, estado, notas,
servicio) y pulso guardar, quiero que TODOS los cambios queden persistidos y visibles
en el listado, para confiar en que el CRM refleja la realidad.

## Acceptance criteria

- AC0 (fix principal): al crear o reprogramar una cita con hora H, la cita se
  persiste y se muestra exactamente a la hora H (listado, chips y calendario),
  independientemente de la zona horaria del servidor. POST `T09:30:00` → GET
  `hora: "09:30"`.

- AC1: `PATCH /bookings/:id` acepta y persiste `status`, `serviceId`, `employeeId`,
  `notes` y `start`; rechaza valores fuera del enum con 422.
- AC2: Cambiar `start` o `serviceId` revalida disponibilidad; conflicto → 409 y ningún
  campo se persiste (operación atómica).
- AC3: El front envía todos los campos editados y tras guardar el listado muestra los
  valores nuevos.
- AC4: Cambio de `status` queda registrado en el historial de estado de la reserva.

## Given-When-Then

Given una cita existente y el modal de edición abierto en modo API
When el usuario cambia el estado a "Confirmada" y el empleado, y pulsa guardar
Then el PATCH envía ambos campos, responde 200, y el listado refrescado muestra
"Confirmada" y el nuevo empleado; en la base de datos `crm.reserva.estado` y
`empleado_id` reflejan el cambio y hay entrada nueva en `historial_estado_reserva`.

## Test per task

| Tarea | Test |
|---|---|
| WU1 back PATCH ampliado | test e2e back (node:test): PATCH con status+employeeId persiste; status inválido → 422; conflicto start → 409 sin cambios |
| WU2 front payload completo | `tests/citas-page-edicion.test.tsx`: onSubmit envía status/serviceId/employeeId/notes/start mapeados |

Un WU está DONE solo con su test en verde.
