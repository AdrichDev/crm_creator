# Validación — crm-n8n-automations

Historia: como negocio quiero que el CRM notifique automáticamente (citas, facturación,
marketing, equipo) por canales escalables (email hoy; WhatsApp/SMS mañana) sin acoplar el
runtime del CRM a un proveedor SMTP, y sin que una caída de n8n bloquee jamás el negocio.

## Criterios de aceptación (AC)
- AC1: con `AUTOMATION_WEBHOOK_URL` configurada, los emails de citas salen vía n8n (evento
  firmado HMAC, idempotente); sin ella, salen por SMTP directo (comportamiento actual). Nunca ambos.
- AC2: fallo de n8n = fallo suave (retry/backoff del emisor o del drainer); el flujo de negocio
  (crear cita, marcar no-show) responde 2xx igualmente.
- AC3: lib automation versionada en la plantilla `back/` (no solo en generated/).
- AC4: plantillas de email versionadas en `n8n/templates/` (fuente de verdad).
- AC5: back tests verdes, tsc limpio; verificación e2e real de al menos 1 evento por rama.

## Por tarea — Fase 2 (Given-When-Then + test)
- 2.0.a port lib → Given payload y secreto, When sign/verify, Then HMAC coincide y verify es
  timing-safe; sin URL configurada emit() es no-op suave. Test: unit firma + soft-fail.
- 2.0.b puerto → Given URL configurada, When notifyBookingConfirmed, Then emit('booking.confirmed')
  y 0 llamadas a sendEmail; Given URL vacía, Then sendEmail con la plantilla actual y 0 emit.
  Test: unit con mocks de ambas dependencias.
- 2.0.c eventos → Given dos llamadas con el mismo eventId, When se procesan, Then n8n ruta
  'duplicate' la segunda (contrato dispatcher). Test: unit payload/typing + e2e 2.5.
- 2.1 recordatorios → Given Notification 24h vencida reclamada, When drainer procesa con URL
  configurada, Then emit('booking.reminder.24h') con eventId=notification.id y fila 'sent';
  con URL vacía, sendEmail directo (regresión intacta). Test: drainer unit (ambas vías).
- 2.2 confirmación → Given alta de cita con cliente con email, When POST /bookings, Then 201
  siempre y notificación vía puerto (fire-and-forget). Test: bookings.email actualizado.
- 2.3 no-show → Given cita ASISTIÓ pendiente, When POST /:id/no-show, Then 200 y
  notify no_show vía puerto. Test: unit transición.
- 2.4 dispatcher → Given evento booking.* firmado, When llega al webhook, Then rama correcta +
  plantilla correcta; firma mala → 401. Test: e2e 2.5 (real) + revisión JSON.
- 2.5 verificación real → Given workflow activo y SMTP CRM, When se envía evento firmado de cada
  rama booking.*, Then email recibido (achozas9@hotmail.com) y reenvío con mismo eventId no
  duplica. BLOQUEADO por N8N_API_KEY (usuario).

Regla: tarea DONE solo con su test verde. Fases 3-5 añadirán su bloque G-W-T al abrirse.

## Por tarea — Fases 3-5 (añadido 2026-07-02)
- 3.0 scheduler → Given digest ya emitido hoy (fila Notification), When el scheduler vuelve a
  correr, Then NO re-emite (unique); Given fallo de emit, Then reintento con backoff sin tumbar
  el proceso. Test: unit con prisma mock/inyección.
- 3.2 facturas → Given 2 facturas 'Pendiente' y 1 'Pagada', When digest diario, Then evento a
  cada admin con detalle de 2 filas; sin pendientes → no emite. Test: unit.
- 3.3 caja → Given 3 ventas hoy (2 efectivo, 1 tarjeta), When digest, Then total y desglose por
  método correctos; 0 ventas → emite con total 0. Test: unit.
- 3.4 stock → Given producto stock<=minimo, When digest, Then aparece en detalle; ninguno → no
  emite. Test: unit.
- 4.1 cumpleaños → Given cliente con fechaNacimiento hoy y email, When corre el diario, Then
  evento customer.birthday a ese cliente; segundo run mismo día → 0 duplicados. Test: unit.
- 4.2 reactivación → Given cliente sin booking desde hace >90 días, When digest semanal, Then
  aparece en el detalle a admins; cliente activo → no aparece. Test: unit.
- 4.3 reseña → Given booking transiciona a COMPLETED con cliente con email, When transición,
  Then review.request al cliente (soft-fail, respuesta 200 intacta). Test: unit rutas.
- 4.4 bono → Given CustomerPackage sesionesUsadas=sesionesTotal-1, When digest, Then
  package.renewal_due al cliente; con sesiones de sobra → nada. Test: unit.
- 5.1 vacaciones → Given POST /time-off, Then timeoff.requested a admins; Given PATCH a
  APPROVED/REJECTED, Then timeoff.resolved al empleado. Soft-fail siempre. Test: unit rutas.
- 5.2 fichajes → Given fichajes de la semana pasada de 2 empleados, When digest de lunes, Then
  horas por empleado correctas en detalle. Test: unit.
- 6.1/6.2 → Given evento firmado de cada rama nueva, When llega al dispatcher desplegado, Then
  200 + email real enviado (ejecución n8n success) y duplicado → sin reenvío (patrón 2.5).

## Verificado (2026-07-02) — 6.1/6.2 dispatcher F3-5
- Dispatcher: 22 nodos, 18 reglas Switch, 17 nodos Email, 10 plantillas nuevas versionadas,
  0 interpolación cruda en html nuevo (todo data.safe). JSON validado (orquestador). ✓
- Deploy: PUT REST 200, activo, credencial SMTP CRM inyectada en 17 nodos Email. ✓
- e2e real: 10 ramas × evento firmado → 10 emails enviados a achozas9@hotmail.com (ejecuciones
  97-106 success, cada una con su nodo Email); duplicado mismo eventId → 200 SIN email (107). ✓
- Back 3.0-5.2 VERIFICADO: digestScheduler (interval horario, idempotencia canal='digest' +
  P2002, crash-safe, multi-tenant revisado) + 10 eventos tipados + review.request en COMPLETED +
  timeoff ida/vuelta. 225 tests, 0 fail, tsc limpio. Review fresco: 3 hallazgos confirmados y
  ARREGLADOS (cumpleaños 29-feb → se felicita el 28 en años no bisiestos, con tests; inactivos
  y renovaciones acotados en BD — take 500 / $queryRaw LIMIT 200), 1 falso positivo. ✓
- Nota: los agregados de digest en BD real (H2/H3) se validan en producción (unit tests mockean
  deps por DI). Los digests solo emiten con AUTOMATION_WEBHOOK_URL configurada (skip suave).

## Verificado (2026-07-02) — Fase 2 (2.0.a-2.4)
- Back plantilla: lib automation portada (signer/events/index) + puerto `lib/notify.ts` +
  drainer/bookings vía puerto. 196 tests, 146 pass, 0 fail, 50 skip e2e (necesitan back vivo);
  +24 nuevos cubren: firma HMAC timing-safe, soft-fail, ambas vías (URL→emit sin sendEmail;
  sin URL→sendEmail sin emit) para confirmación/recordatorios/no-show. tsc limpio. ✓
- Dispatcher: 8 reglas (4 booking.* nuevas), 4 plantillas booking-*.html versionadas, JSON
  validado (12 nodos, router 9 salidas, verify/idempotencia/401 intactos). ✓ (verificación
  orquestador con node JSON.parse + inspección de reglas)
- 2.5 VERIFICADO (2026-07-02, API key en back/.env): PUT REST → 12 nodos activos, credencial
  SMTP CRM (csEkljEKBPGTLhNF) en los 7 nodos Email. e2e real: booking.confirmed / reminder.24h /
  reminder.2h / no_show → 200 + email enviado cada uno (ejecuciones n8n success con nodo Email);
  reenvío mismo eventId → 200 ruta duplicate SIN email; firma manipulada → 401. Payload de prueba
  incluía `employeeName` con HTML (`<b>`) → escapado por data.safe (fix XSS operativo). ✓
  Pendiente V.2: rate limit del webhook (config de instancia/reverse-proxy, infra usuario).
