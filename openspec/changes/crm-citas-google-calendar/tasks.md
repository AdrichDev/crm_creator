# Tareas — crm-citas-google-calendar

Nivel 4 (seguridad tokens + integración externa) → aprobación humana antes de Apply.
Orden: modelo → ICS → emisor n8n → UI. Ruflo gate antes de push.

## WU1 — Modelo: token de calendario + preferencia
- [x] 1.1 Migración aditiva: `calendar_token_hash` + `calendar_push_enabled` (o tabla
      `CalendarToken` alineada con el patrón `AuthToken` existente) con @@map castellano.
      ⚠️ La aplica el usuario (convención del repo).
      Nota: el modelo `AuthToken` de la propuesta ya no existe en el repo (auth migró a
      Supabase-managed sessions, ver `back/src/routes/__tests__/auth-users.e2e.test.ts`).
      Se diseñó `CalendarToken` (tabla `token_calendario`) desde cero siguiendo el mismo
      principio (hash en DB, valor en claro solo al crear), con RLS habilitado y SIN
      política de lectura para `authenticated` (secreto, solo backend/service role).
      Migración: `back/prisma/migrations/20260702000000_calendar_feed/migration.sql`.
- [x] 1.2 Servicio generar/revocar/regenerar token (hash en DB, valor en claro solo en la
      respuesta de creación) + test. `back/src/lib/calendarToken.ts` +
      `back/src/lib/__tests__/calendar-token.test.ts` (13 tests, repo en memoria).

## WU2 — Feed ICS
- [x] 2.1 Serializador puro `toICS(items)` (RFC 5545: escapado, folding, UID estable, DTSTAMP)
      + test unit exhaustivo. `back/src/lib/ics.ts` + `back/src/lib/__tests__/ics.test.ts`
      (15 tests: escapado, folding UTF-8-safe, UID, DTSTART/DTEND/DTSTAMP, CRLF).
- [x] 2.2 GET `/calendar/feed/:token.ics`: resuelve token→usuario, rango -30/+90d, solo
      título/cliente/hora/dirección, 404 opaco, rate-limit (bucket propio — gotcha e2e:
      aislamiento de reset por bucket) + tests scoping/privacidad.
      `back/src/routes/calendar.ts` (endpoint) + `back/src/lib/calendarFeed.ts` (selección
      pura, testeable sin DB) + `back/src/lib/__tests__/calendarFeed.test.ts` (14 tests:
      rango, privacidad AC3, aislamiento cross-user WU2.2). Bucket rate-limit propio
      `calendar-feed` en `back/src/lib/rateLimit.ts` (reutiliza el mecanismo existente).
      2.3 (rango y privacidad) cubierto en el mismo test file.

## WU3 — Push vía n8n (opt-in)
- [x] 3.1 Emisor `calendarEmitter` soft-fail (patrón del emisor n8n existente): evento al
      confirmar cita / crear recordatorio con fecha si `calendar_push_enabled` + tests (on/off,
      payload, soft-fail). `back/src/lib/calendarEmitter.ts` +
      `back/src/lib/__tests__/calendarEmitter.test.ts` (8 tests). Evento nuevo
      `calendar.event_push` en `back/src/lib/automation/events.ts`. `emit()` ganó un
      override opcional `{url, secret}` (back-compat, resto de eventos sin cambios) para
      poder apuntar a un webhook n8n DISTINTO del dispatcher de emails. Enganchado en
      `back/src/routes/bookings.ts` (confirmación, staff asignado) y
      `back/src/routes/reminders.ts` (creación con fecha, responsable).
- [x] 3.2 Workflow n8n `crm-calendar-push` (webhook → Google Calendar node, credencial en n8n)
      + doc de configuración en `creador_CRM/n8n/`.
      `n8n/workflows/crm/crm-calendar-push.json` (workflow separado del dispatcher de
      emails, webhook propio `/webhook/crm-calendar-push`, mismo HMAC que el dispatcher)
      + sección nueva en `n8n/README.md`. Estado: JSON creado, PENDIENTE DEPLOY (falta
      credencial OAuth de Google real y verificación e2e — igual que el resto de fases
      nuevas de este directorio).

## WU4 — UI Mi Cuenta
- [x] 4.1 Sección "Calendario": URL ICS (copiar, mostrar solo al crear/regenerar), regenerar,
      revocar, toggle push, aviso de latencia de refresco de Google + test front.
      `front/components/config/calendar-section.tsx` (montado en `my-account-panel.tsx`,
      sin tocar la UX existente de consola/onboarding) + `front/lib/api/calendar.ts` +
      `front/tests/calendar-api.test.ts` (5 tests) + `front/tests/calendar-section.test.tsx`
      (10 tests).

## Cierre
- [x] Z.1 back + front tests + tsc limpios; smoke manual: suscribir feed en Google Calendar real.
      back: 240 pass / 1 fail (pre-existente, `reminders-summary.e2e.test.ts` de OTRO
      change concurrente — falla por `DATABASE_URL` no definida en esta sesión, no
      relacionado con este cambio) / 37 skip (viven de Supabase real). front: 349/349
      pass. tsc limpio en ambos. Smoke manual contra Google Calendar real: PENDIENTE
      (requiere migración aplicada + credencial OAuth real — fuera del alcance del
      builder, lo ejecuta el orquestador/usuario).
- [x] Z.2 Revisión de seguridad + Ruflo review HECHO (02/07/2026): feed limpio (SHA-256,
      404 opaco, rate-limit 30/min bucket propio, rango acotado, sin notas comerciales,
      scoping cross-user íntegro); push al calendario del staff con gate calendarPushEnabled
      y soft-fail verificados. 🟡 pendiente operativo: deploy del workflow n8n con credencial
      OAuth real + env CALENDAR_WEBHOOK_URL. Migración 20260702000000_calendar_feed APLICADA
      en Supabase (RLS on, 0 policies, verificado).
- [ ] Z.3 Aprobación humana antes de merge (Nivel 4). Apply aprobado por el usuario el
      02/07/2026; falta el OK final de commit/merge.

## Hallazgo de prueba en vivo (02/07/2026) — push NO es multi-tenant tal como está

Prueba real con negocio "Comercial Demo IA" (20 clientes IA, achozas9@gmail.com):

- **Feed ICS: validado end-to-end y SÍ es multi-tenant correcto.** Cada usuario tiene su
  propio token/URL sin OAuth (10 eventos servidos vía túnel público, formato RFC 5545
  correcto). Cubre el caso real de negocio sin ningún problema de escala.
- **Push vía n8n (WU3): mecanismo probado hasta el borde de la credencial OAuth, PARADO
  ahí a petición del usuario.** Al llegar al nodo "Google Calendar: crear evento" se
  detectó que el diseño actual usa **una credencial n8n estática (una sola cuenta Google)**
  compartida por todo el workflow. Con 1 usuario de prueba es suficiente, pero **no escala
  a N clientes reales**: todos los eventos se crearían en el calendario de la cuenta Google
  conectada a esa única credencial, no en el de cada cliente.
- **Qué hace falta para push multi-tenant real** (fuera de alcance de este change, requiere
  spec nueva): cada usuario conecta SU PROPIO Google Calendar desde Mi Cuenta (flujo OAuth
  propio del back, no la credencial estática de n8n); el back guarda el refresh token por
  usuario y llama a la Calendar API directamente (o pasa el token al workflow n8n por
  ejecución en vez de usar credencial fija). Un solo Client ID/Secret de Google Cloud basta
  para todos los clientes (esa parte del proceso NO se repite por cliente) — lo que cambia
  es que el TOKEN de acceso debe ser por usuario, no fijo por instancia de n8n.
- **Decisión:** no se completó el alta de credencial OAuth de Google Cloud hoy (el usuario
  paró conscientemente al ver esta limitación). Workflow `crm-calendar-push` queda importado
  en n8n (instancia `n8n-agents-agency`, puerto 5678) sin credencial conectada — WU3.2 sigue
  PENDIENTE DEPLOY. Retomar cuando se aborde push multi-tenant como cambio propio.
