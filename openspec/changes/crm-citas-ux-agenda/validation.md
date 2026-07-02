# Validación — crm-citas-ux-agenda

Historia: como **dueño/staff de un negocio con citas** (peluquería, estética…) quiero crear
citas eligiendo una hora realmente libre de un vistazo, ver y anotar los detalles de una
cita desde Inicio, editar citas con la seguridad de que se guardan, y consultar la ficha
del cliente sin salir de la agenda — todo legible en modo oscuro.

## Criterios de aceptación (AC)
- **AC1 (selects dark):** en modo oscuro, TODOS los selects del panel (nueva cita,
  filtros de citas) muestran fondo y opciones con los tokens del tema; en modo claro
  siguen correctos. Sin `color:#111` hardcoded en el scope del panel.
- **AC2 (slots):** `GET /bookings/slots?date&serviceId[&employeeId]` devuelve slots desde
  el horario de apertura del día, con paso = duración del servicio, marcando
  `disponible:false` los que solapan citas no canceladas (del empleado si se pasa, de
  cualquier recurso necesario si no). Día cerrado → lista vacía.
- **AC3 (chips):** el modal de nueva cita muestra chips de hora tras elegir fecha y
  servicio; ocupadas deshabilitadas y no seleccionables; elegir chip fija la hora; la
  cita creada dura exactamente `Service.duracion` (endAt correcto, comportamiento del
  back existente verificado).
- **AC4 (persistencia):** editar una cita desde /citas en modo API emite
  `PATCH /bookings/:id`; tras F5 el cambio sigue; un conflicto de disponibilidad del
  back se muestra como error y no se pisa el estado local.
- **AC5 (modal detalle):** click en una cita del widget de Inicio abre modal con datos
  (cliente, servicio, empleado, fecha/hora, estado) + textarea "Anotaciones" precargada
  con `Booking.notes`; Guardar persiste vía PATCH y reabre mostrando lo guardado;
  "Cerrar" (outline) cierra; "Ir a agenda" navega a `/citas?edit=id`.
- **AC6 (ficha cliente):** click en el nombre del cliente en la lista de /citas abre
  modal con la ficha completa (datos de contacto, dirección, estado, notas del cliente),
  patrón dl/dt/dd + ✕ rotatorio, tokens CRM.
- **AC7 (no regresión):** flujo de crear cita en modo generador (localStorage) intacto;
  tpv-select y onboarding sin cambios visuales; suites front+back verdes, tsc limpio.

## Por tarea (Given-When-Then + test)
- **WU1.1** CSS selects → Given panel dark, When se renderiza un select con `inputCls`,
  Then computed style de fondo = token panel (test visual Playwright o unit de clase
  presente) y no existe regla `option{color:#111}` en el scope. Test: grep/unit + smoke.
- **WU2.1** Slots básicos → Given horario L-V 9-20 y servicio 30', When GET slots de un
  martes, Then chips 9:00…19:30 cada 30'. Test: node:test `bookings-slots.test.ts`.
- **WU2.2** Slots ocupados → Given cita 10:00-10:30 no cancelada del empleado X, When GET
  slots con employeeId=X, Then 10:00 `disponible:false` y 10:30 `true`. Test: node:test.
- **WU2.3** Día cerrado → Given domingo sin OpeningHour, When GET slots, Then `[]`.
  Test: node:test.
- **WU3.1** Chips UI → Given fecha+servicio elegidos, When cargan slots, Then chips
  renderizados y ocupado disabled; click en disponible fija hora en el form. Test: vitest
  render con fetch mockeado.
- **WU4.1** PATCH al editar → Given cita existente en modo API, When submit del editor,
  Then `PATCH /bookings/:id` con body correcto y refresh; Given back responde 409/422,
  Then error visible y sin mutación local. Test: vitest con apiFetch mockeado.
- **WU5.1** Modal detalle → Given cita en widget Inicio, When click, Then modal con datos
  y notes; When editar textarea y Guardar, Then PATCH con `{notes}` y estado actualizado.
  Test: vitest render + mock.
- **WU5.2** Botones → "Cerrar" usa Button outline, "Ir a agenda" Button primary y navega
  a `/citas?edit=id`. Test: vitest.
- **WU6.1** Ficha cliente → Given fila de cita, When click en nombre, Then modal con
  datos del customer (fetch por id) en patrón dl/dt/dd. Test: vitest render + mock.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.
