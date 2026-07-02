# Tasks — crm-n8n-automations   (Nivel 3 — Fase 0+1 DESPLEGADAS Y VERIFICADAS)

## Fase 0 — Infra
- [x] 0.1 n8n operativo (contenedor compartido `n8n-agents-agency`, project `3a_estudio`). Servicio definido también en `docker-compose.yml` del CRM. Env requeridas: `NODE_FUNCTION_ALLOW_BUILTIN=crypto` + `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` + `AUTOMATION_WEBHOOK_SECRET`. API key fijada; despliegue vía REST API (el MCP bloquea localhost por SSRF). Workflow id `iJsa8iZjrjV20abQ` activo.
- [x] 0.2 Definir `AUTOMATION_WEBHOOK_SECRET` y firma HMAC en el backend (`lib/automation/signer.ts` sign/verify sobre `timestamp.body`; env keys en `env.ts`).
- [x] 0.3 Capa `lib/automation` en el back: `emit(name, data, {businessId, eventId?})` con `eventId` (idempotencia), retry con backoff, timeout y FALLO SUAVE (nunca throw; no-op si `AUTOMATION_WEBHOOK_URL` vacío). Eventos `user.invited`, `password.reset_requested`. (Cola persistente en Postgres → diferida; emisor en proceso por ahora.)

## Fase 1 — Credenciales (prioritario, sostiene auth)
- [x] 1.1 Flujo "email alta usuario" (rama `user.invited`) + plantilla `n8n/templates/user-invited.html`. Workflow `n8n/workflows/crm/crm-automation-dispatcher.json`. DESPLEGADO + credencial SMTP `SMTP CRM` (Gmail) asignada + activo. VERIFICADO: email enviado (ejecución n8n `success`).
- [x] 1.2 Flujo "recuperación de contraseña" (rama `password.reset_requested`) + plantilla `n8n/templates/password-reset-requested.html`. VERIFICADO: email enviado.

## Fase 2 — Citas (DECISIÓN USUARIO 2026-07-02: máxima escalabilidad, mínima deuda)
Diseño: lib automation PORTADA a la plantilla `back/` (versionada; generated/ está gitignorado).
Puerto de notificación con fallback: si `AUTOMATION_WEBHOOK_URL` configurada → emit a n8n (n8n
renderiza y envía; canales escalables); si no → SMTP directo actual (email.ts). Una sola vía
activa por despliegue → sin emails dobles, sin regresión. Drainer intacto como scheduler
(claim atómico); solo cambia el paso de envío. vitaldent NO se toca (plantilla = fuente de verdad).
- [x] 2.0.a Portar `lib/automation/` (events/signer/index) de vitaldent a plantilla `back/` +
  claves env (`AUTOMATION_WEBHOOK_URL/SECRET`, opcionales fail-open) + tests firma/soft-fail.
- [x] 2.0.b Puerto `lib/notify.ts`: notifyBookingConfirmed/Reminder/NoShow → emit si hay URL,
  sendEmail directo si no. Test de ambas vías (mock).
- [x] 2.0.c Eventos nuevos tipados: `booking.confirmed`, `booking.reminder.24h`,
  `booking.reminder.2h`, `booking.no_show` (payload: bookingId, businessName, customerName,
  email, serviceName, employeeName?, fecha, hora). Idempotencia: eventId = notification.id
  (recordatorios) / `bookingId:estado` (transiciones).
- [x] 2.1 Recordatorio 24h/2h: reminderDrainer envía vía puerto (antes sendEmail directo). Tests drainer actualizados.
- [x] 2.2 Confirmación de reserva: bookings.ts post-create vía puerto. Tests bookings.email actualizados.
- [x] 2.3 No-show: transición NO_SHOW vía puerto. Test.
- [x] 2.4 HECHO 2026-07-02: dispatcher con 8 reglas (4 booking.* nuevas) + 4 plantillas
  `n8n/templates/booking-*.html` + README. Verify/idempotencia/401 intactos. JSON validado
  (12 nodos, router 9 salidas). Pendiente importar/desplegar (2.5).
- [x] 2.5 DESPLEGADO Y VERIFICADO 2026-07-02 (API key en back/.env): PUT REST del dispatcher
  (12 nodos, credencial SMTP CRM reasignada, activo). e2e real: 4 eventos firmados → 4 emails
  enviados (ejecuciones n8n 91-94 success, nodo Email ejecutado, a achozas9@hotmail.com);
  duplicado mismo eventId → 200 SIN email (ejec. 95); firma inválida → 401 (ejec. 96).

## Fases 3-5 — DISEÑO 2026-07-02 (patrón F2 verificado; sin migraciones)
Infra: `lib/digestScheduler.ts` generaliza el patrón drainer (interval horario, idempotencia por
unique Notification [tipo,businessId,destino,programadoEn]); el back CALCULA los agregados y
emite eventos vía emit() directo (n8n renderiza/envía). SIN fallback SMTP: F3-5 son features
nuevas sin regresión que proteger; sin AUTOMATION_WEBHOOK_URL → skip suave (el fallback SMTP
se mantiene SOLO en F2, donde había comportamiento previo).
Digests con `detalle` = texto plano multilínea (escapado por data.safe; cero HTML desde datos).
Destinatarios admin = User.email de Memberships ADMIN del negocio (helper `adminEmails()`).

### Fase 3 — Facturación / ventas
- [x] 3.0 Infra: digestScheduler + helper adminEmails + arranque en server.ts (env DIGEST_*). Tests.
- [ ] 3.1 Factura por email (PDF) — BLOQUEADA: Invoice sin email/FK de cliente y PDF = dependencia
  nueva → necesita migración aditiva + decisión usuario. Se abrirá aparte.
- [x] 3.2 Aviso facturas pendientes/vencidas → digest DIARIO a admins (Invoice estado
  'Pendiente'/'Vencida'; evento `invoice.pending_digest`). Test.
- [x] 3.3 Resumen diario de caja → digest DIARIO a admins (Σ ventas del día, por método;
  evento `cash.daily_summary`; se emite aunque 0 ventas). Test.
- [x] 3.4 Stock bajo → digest DIARIO a admins (productos stock<=minimo; evento `stock.low_digest`;
  sin filas → no se emite). (Nota: decremento de stock al vender NO existe — SaleLine sin productId;
  fuera de alcance.) Test.

### Fase 4 — Clientes / marketing
- [x] 4.1 Cumpleaños → evento DIARIO por cliente con fechaNacimiento hoy y email
  (`customer.birthday`, directo al cliente; idempotencia destino+día). Test.
- [x] 4.2 Reactivación inactivos → digest SEMANAL a admins con clientes sin cita desde hace
  90 días (evento `customer.reactivation_digest`; a admins, NO spam directo al cliente). Test.
- [x] 4.3 Reseña post-servicio → evento en transición COMPLETED de booking
  (`review.request`, al cliente; mismo patrón que no-show). Test.
- [x] 4.4 Renovación de bono → digest DIARIO: CustomerPackage con sesiones restantes <=1
  (evento `package.renewal_due`, al cliente si tiene email; idempotente por package+día). Test.

### Fase 5 — Equipo / estudios
- [x] 5.1 Vacaciones ida/vuelta → eventos en timeoffRouter: POST → `timeoff.requested` (a admins);
  PATCH resolución → `timeoff.resolved` (al empleado si tiene email). Test.
- [x] 5.2 Resumen de fichajes → digest SEMANAL (lunes) a admins con horas por empleado de la
  semana anterior (evento `fichaje.weekly_summary`). Test.
- [ ] 5.3 Estudio de mercado programado — BLOQUEADA: estudios viven solo en front/localStorage,
  sin motor de generación en back → change aparte (ligado a crm-sectorial-ia/market-studies).

### Cierre F3-5
- [x] 6.1 HECHO 2026-07-02: dispatcher 22 nodos / 18 reglas (10 eventos F3-5 nuevos) + 10
  plantillas versionadas; todo el html nuevo vía data.safe (0 data cruda). JSON validado.
- [x] 6.2 DESPLEGADO Y VERIFICADO 2026-07-02: PUT REST (22 nodos, activo, credencial SMTP CRM
  en los 17 nodos Email). e2e real: 10 eventos firmados → 10 emails enviados (ejecuciones n8n
  97-106 success con su nodo Email); duplicado → 200 sin email (107).

## Verificación
- [x] V.1 VERIFICADO e2e (2026-06-17): envío real (alta+reset, email `success` a achozas9@hotmail.com), idempotencia (ruta `duplicate`, sin reenvío), firma inválida/secreto malo → 401. Fallo suave del emisor cubierto por unit tests del back.
- [~] V.2 Revisión seguridad: firma webhook (✓ HMAC-SHA256 timingSafe + anti-replay 5 min + idempotencia por eventId), 401 ante firma/secreto inválidos (✓ probado), PII en plantillas (✓ solo firstName + enlace token, sin password ni logs de data). PENDIENTE: rate limit en el webhook n8n (config de instancia/reverse-proxy).
