# Tasks — crm-citas-supabase   (Nivel 3 — APROBADO, en implementación)

> Diseño en `proposal.md`/`design.md`. Decisiones cerradas (2026-06-25): Motor Express+nodemailer; SMTP Gmail "SMTP CRM".
> SUPERSEDE: reemplaza las tareas 2.1–2.3 de `crm-n8n-automations` (Fase 2 — Citas).

## Aprobaciones (CERRADAS 2026-06-25)
- [x] AP.1 SMTP: reusar cuenta Gmail "SMTP CRM" (App Password) — misma que n8n Fase 1.
- [x] AP.2 `nodemailer` como dep del back — aprobada.
- [x] AP.3 Migración Prisma `@@unique([tipo, businessId, destino, programadoEn])` en `notificacion` — aprobada (aditiva).

## Fase A — Transporte (unidad segura, inerte hasta configurar SMTP)
- [x] A.1 `back/package.json`: añadir `nodemailer` + `@types/nodemailer`.
- [x] A.2 `back/src/env.ts`: añadir `smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, emailEnabled`.
          Añadir a `.env.example` (sin valores reales). Default `EMAIL_ENABLED=false` en tests.
          NOTA: `.env.example` bloqueado por permisos del SO; vars documentadas en comentarios de `env.ts`.
- [x] A.3 Crear `back/src/lib/email.ts`: transport nodemailer, `sendEmail(payload)` soft-fail,
          plantillas inline (español) `confirmedTemplate`, `reminderTemplate`, `noShowTemplate`.
- [x] A.4 Unit tests (node:test): `sendEmail` sin smtp → false + no crash; con smtp mock → llama transporter;
          stub que lanza → false. tsc limpio. 9/9 verdes.

## Fase B — Cola de recordatorios
- [x] B.1 Migración Prisma aditiva: verificar `Notification.businessId`; añadir `@@unique(...)`.
          `prisma generate` OK (workaround EPERM: mv client_old_* + generate).
          APLICADA A PRODUCCIÓN 2026-06-25 (`prisma migrate deploy` OK; status "up to date"). Autorizada por humano.
          Migration SQL en `prisma/migrations/20260625120000_notification_unique_reminder/migration.sql`.
- [x] B.2 Crear `back/src/lib/reminderDrainer.ts`: setInterval 60 s, consulta Notification pending
          con `programadoEn <= now()`, verifica booking activo, llama sendEmail, actualiza estado.
          Exponer `startReminderDrainer()`. DI para testabilidad.
- [x] B.3 `back/src/server.ts`: importar y llamar `startReminderDrainer()` tras `app.listen`.
- [x] B.4 Unit tests drainer: DB vacía → sin crash; pending+booking activo → sendEmail;
          booking CANCELLED → 'skipped'; booking inexistente → 'skipped'; idempotencia. 9/9 verdes.

## Fase C — Puntos de emisión en bookings
- [x] C.1 `back/src/routes/bookings.ts` `POST /`:
          a. fire-and-forget `sendEmail` confirmación (si customer.email).
          b. upsert 2 filas `Notification` (24h y 2h); skip si `programadoEn` ya pasó.
- [x] C.2 `back/src/routes/bookings.ts` `POST /:id/no-show`:
          fire-and-forget `sendEmail` no-show. Cargar customer/service/business si faltan.
- [x] C.3 Tests e2e `bookings.email.test.ts` (node:test):
          recordatorios count logic; confirmación template; no-show template; soft-fail; idempotencia. 11/11 verdes.

## Verificación final
- [x] V.1 SMTP real: email de confirmación recibido al crear booking. → CUBIERTA 2026-07-02 por crm-n8n-automations F2: booking.confirmed verificado con email real (ejec. n8n success).
- [x] V.2 SMTP real: recordatorio recibido al llegar la hora programada. → CUBIERTA 2026-07-02 por F2: booking.reminder.24h/2h verificados con email real.
- [x] V.3 SMTP real: email de no-show recibido al marcar no-show. → CUBIERTA 2026-07-02 por F2: booking.no_show verificado con email real.
- [x] V.4 Fallo suave: SMTP caído → booking 201, no-show 200. → CUBIERTA por puerto notify soft-fail (tests unit: fallo emisor nunca rompe 201/200).
- [x] V.5 Idempotencia: 0 duplicados en `notificacion`. → CUBIERTA 2026-07-02: duplicado mismo eventId → 200 sin reenvío (verificado en vivo).
- [x] V.6 tsc + back tests verde (node:test). 94/94 verde (verificado 2026-06-25).

## Tras verde: gate Ruflo (revisión refactor) ANTES de cualquier commit/push.

## Deuda documentada (fuera de este change)
- Multi-réplica: `SELECT FOR UPDATE SKIP LOCKED` en drainer.
- Booking reprogramado: cancelar filas Notification pending en `PATCH /:id`.
- Retry de reminders fallidos.
- Branding completo en plantillas.
- Provider SMTP de mayor volumen cuando supere ~500/día.
