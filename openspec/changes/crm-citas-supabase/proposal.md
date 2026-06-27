# Proposal — Automatizaciones de citas sobre Express/SMTP (crm-citas-supabase)

**Nivel Gru: 3 — Grande.** Cruza 3+ dominios (DB, back, SMTP/infra), nueva dep, migración Prisma aditiva.
**Estado: APROBADO (2026-06-25) — listo para implementar.**

> SUPERSEDE: este change reemplaza la **Fase 2 de `crm-n8n-automations`** (citas). La Fase 2 de ese
> change queda ANULADA. Las Fases 0+1 de ese change (credenciales) siguen operativas e intactas.

## Decisiones aprobadas (2026-06-25)
- **Motor**: Express + nodemailer (NO Edge Functions/pg_cron). Reusa el modelo `Notification` muerto como cola.
- **SMTP**: reusar la cuenta Gmail "SMTP CRM" (App Password) que ya usó n8n en Fase 1.
- **Dep `nodemailer`**: aprobada.
- **Migración Prisma aditiva** (`@@unique` en `notificacion`): aprobada.

## Contexto

El emisor n8n fue retirado en la migración a Supabase Auth (jun 2026). Las automatizaciones de citas
(Fase 2 de `crm-n8n-automations`) quedaron sin implementar. El humano eligió reimplementarlas sobre
Supabase/Express puro (sin n8n), alineado con la arquitectura migrada.

El modelo `Notification` ya existe en `schema.prisma` (tabla `notificacion`) con todos los campos
necesarios para una cola de emails (tipo, destino, payload, programadoEn, enviadoEn, estado) pero
está completamente muerto — sin ruta ni lógica. Este change lo activa.

## Intención

Tres automatizaciones transaccionales de citas:
1. **`booking.confirmed`** — email al cliente al crear una cita.
2. **`booking.reminder`** — recordatorio 24h y 2h antes de la cita (programado).
3. **`booking.no_show`** — email de seguimiento al marcar no-show.

Sin n8n. Sin Edge Functions. Sin pg_cron. Transporte: SMTP (nodemailer en el proceso Express).

## Decisiones técnicas

- **Transporte**: nodemailer en Express (`lib/email.ts`), soft-fail (el CRM nunca depende del envío).
- **Cola**: reusar modelo `Notification` (ya en schema) como cola persistente de reminders.
- **`booking.confirmed`**: disparar en `POST /bookings` (creación PENDING). No introducir transición
  CONFIRMED — la cita manual del staff está confirmada en el momento de crearla.
- **Reminders**: `setInterval` drainer en `server.ts` que escanea `Notification` pendientes
  con `programadoEn <= now()`. Al crear booking → insertar 2 filas (24h y 2h antes).
- **Idempotencia**: constraint `@@unique([tipo, businessId, destino, programadoEn])` en `Notification`
  — el insert de duplicado falla silenciosamente (upsert ignorado).
- **No-show**: email directo en el handler `POST /:id/no-show`, mismo try/catch soft-fail.
- **PII**: payload mínimo (customerEmail, customerName, serviceName, startsAt, employeeName?).
  Emails transaccionales de citas NO requieren `consentimientoComms` (solo aplica a marketing).

## Alcance

1. Migración Prisma aditiva: añadir `@@unique` (y `businessId` si falta) a `Notification`.
2. Nueva dep `nodemailer` + `@types/nodemailer`.
3. Nuevas vars de entorno SMTP en `env.ts` + `.env.example`.
4. `back/src/lib/email.ts` — transport nodemailer + wrapper `sendEmail(...)` soft-fail.
5. `back/src/lib/reminderDrainer.ts` — drainer setInterval (cada 60 s).
6. Puntos de emisión en `bookings.ts` (POST /, POST /:id/no-show).
7. Arranque del drainer en `server.ts`.
8. Plantillas HTML inline (sin sistema de plantillas externo — strings en `email.ts`). Idioma: español.
9. Tests: unit tests del drainer, idempotencia, soft-fail (node:test).

## Fuera de alcance

- Fases 3–5 de crm-n8n-automations (facturación, clientes/marketing, equipo).
- pg_cron / pg_net / Edge Functions (evolución futura si el back escala).
- Plantillas de email avanzadas con branding dinámico (MVP: texto plano + HTML básico).
- Canal WhatsApp/SMS.

## Riesgos

- Drainer de un solo proceso: si el back escala a multi-réplica puede duplicar emails. Mitigación:
  documentar deuda; usar `FOR UPDATE SKIP LOCKED` en evolución.
- Email en spam: Gmail SMTP con App Password tiene límites de envío (~500/día). Aceptable para MVP.
- Credenciales en `.env`: no committed, documentadas en `.env.example`.
