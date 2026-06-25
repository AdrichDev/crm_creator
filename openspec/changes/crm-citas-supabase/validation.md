# Validación — crm-citas-supabase

Historia: como cliente de un negocio quiero recibir un email al confirmar mi cita,
un recordatorio antes de que llegue, y un seguimiento si no aparezco — todo sin
que el sistema de citas dependa del envío para funcionar.

## Criterios de aceptación (AC)

- **AC1**: Al crear un booking con `customer.email` válido, el cliente recibe un email
  de confirmación con servicio, fecha y hora. POST /bookings responde 201 aunque SMTP esté caído.
- **AC2**: Se insertan exactamente 2 filas en `notificacion` (24h y 2h antes del startAt)
  con estado `pending`. Si `programadoEn` ya pasó, no se inserta esa fila.
- **AC3**: El drainer envía los recordatorios al llegar la hora. La fila pasa a `sent` + `enviadoEn`.
- **AC4**: Si el booking está cancelado/soft-deleted cuando el drainer lo procesa,
  la fila pasa a `skipped` y no se envía email.
- **AC5**: Crear el mismo booking dos veces no genera filas duplicadas (`@@unique` absorbe).
- **AC6**: Al marcar no-show, el cliente recibe email de seguimiento. Endpoint responde 200 aunque SMTP caído.
- **AC7**: Sin SMTP (`smtpHost` vacío) o `EMAIL_ENABLED=false`, todo funciona sin enviar ni lanzar.
- **AC8**: tsc limpio, back tests verdes (node:test).

## Por tarea (Given-When-Then + test)

### A.3 — lib/email.ts
- **Given** SMTP_HOST vacío o EMAIL_ENABLED=false, **When** `sendEmail(payload)`, **Then** devuelve false, no lanza, no llama nodemailer. _Test: unit env mock._
- **Given** transport mock, **When** `sendEmail({to,subject,html})`, **Then** llama `sendMail` con campos correctos y devuelve true. _Test: unit stub transport._
- **Given** `sendMail` lanza, **When** `sendEmail`, **Then** captura, loguea sin PII sensible, devuelve false. _Test: unit stub que lanza._

### B.1 — Migración Notification
- **Given** schema con @@unique, **When** dos upsert con mismo (tipo,businessId,destino,programadoEn), **Then** el segundo ignora el conflicto. _Test: integración Prisma._

### B.2/B.4 — reminderDrainer
- **Given** tabla vacía, **When** iteración drainer, **Then** termina sin error. _Test: unit prisma mock._
- **Given** 1 fila pending + booking activo, **When** drainer, **Then** sendEmail + estado 'sent'. _Test: unit._
- **Given** fila pending con booking CANCELLED, **When** drainer, **Then** 'skipped', no sendEmail. _Test: unit._
- **Given** fila pending con booking inexistente/eliminado, **When** drainer, **Then** 'skipped'. _Test: unit._

### C.1 — POST / booking
- **Given** customer con email, **When** POST /bookings, **Then** 201; 2 filas pending en notificacion. _Test: e2e node:test._
- **Given** SMTP caído, **When** POST /bookings, **Then** 201; no lanza; log "email failed". _Test: unit stub que lanza._

### C.2 — POST /:id/no-show
- **Given** booking activo con customer.email, **When** no-show, **Then** 200, status NO_SHOW, sendEmail subject no-show. _Test: e2e._
- **Given** SMTP caído, **When** no-show, **Then** 200, status NO_SHOW, no lanza. _Test: unit stub._

### V.1–V.3 — SMTP real (manual)
- **Given** Gmail SMTP CRM configurado, **When** crear booking / reminder llega / no-show, **Then** email correspondiente llega a la bandeja. _Test: manual e2e._
