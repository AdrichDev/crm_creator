# Validación — crm-citas-google-calendar

Historia: como **comercial de campo** quiero que mis citas y recordatorios del CRM aparezcan en
mi Google Calendar, para mirar un solo calendario y no apuntar las cosas dos veces.

## Criterios de aceptación (AC)
- **AC1:** GET `/calendar/feed/:token.ics` devuelve un iCalendar válido (VCALENDAR/VEVENT, UID
  estable por entidad) con las citas y recordatorios con fecha del usuario dueño del token,
  dentro del rango -30/+90 días.
- **AC2:** un token revocado o inexistente devuelve 404 sin filtrar si el token existió
  (respuesta indistinguible); regenerar invalida el anterior al instante.
- **AC3:** el feed NUNCA incluye notas comerciales ni datos de otros usuarios/negocios; solo
  título, cliente asociado, fecha/hora y dirección.
- **AC4:** el token se guarda hasheado en DB (nunca en claro) y el endpoint tiene rate-limit.
- **AC5:** con el toggle "enviar a mi calendario" activo, confirmar una cita emite el evento a
  n8n con payload correcto; con el toggle off, no se emite nada (regla de negocio 10).
- **AC6:** si n8n no responde, la cita se confirma igual y el fallo queda logueado (soft-fail,
  caso §11 "integración externa caída").
- **AC7:** en Mi Cuenta el usuario puede copiar la URL ICS, regenerarla, revocarla y cambiar el
  toggle; la UI avisa de la latencia de refresco de Google.
- **AC8 (no regresión):** citas y recordatorios funcionan idéntico con la integración desactivada;
  back+front tests + tsc verdes.

## Por tarea (Given-When-Then + test)
- **WU1.1** Modelo token → Given migración, When `migrate status`, Then sin drift; token hasheado,
  1 activo por usuario. Test: node:test modelo + unicidad.
- **WU1.2** Generar/revocar → Given usuario sin token, When POST generar, Then URL una sola vez;
  When revocar, Then feed 404. Test: `calendar-token.test.ts`.
- **WU2.1** Serializador ICS → Given cita y recordatorio con fecha, When `toICS(items)`, Then
  VEVENT con UID `booking-{id}@crm` / `reminder-{id}@crm`, escapado RFC 5545 correcto (comas,
  saltos). Test: unit puro `ics.test.ts`.
- **WU2.2** Feed scoping → Given dos usuarios de negocios distintos, When GET feed del usuario A,
  Then solo ítems de A (aislamiento cross-tenant y cross-user). Test: node:test e2e.
- **WU2.3** Rango y privacidad → Given cita fuera de rango y nota comercial en cliente, When feed,
  Then cita excluida y nota ausente del ICS. Test: node:test.
- **WU3.1** Emisión n8n → Given toggle on, When cita confirmada, Then POST a n8n con
  {uid, título, inicio, fin, dirección}; Given toggle off, Then cero llamadas. Test: node:test con
  fetch mockeado.
- **WU3.2** Soft-fail → Given n8n 500/timeout, When confirmar cita, Then cita confirmada + error
  logueado, respuesta 2xx. Test: node:test.
- **WU4.1** UI Mi Cuenta → Given sección Calendario, When regenerar, Then URL nueva mostrada una
  vez y la vieja muerta; toggle persiste. Test: front unit.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.
> Nivel 4: requiere aprobación humana explícita antes de Apply.
