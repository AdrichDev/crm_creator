# Design — crm-citas-supabase

**Nivel Gru: 3 — Grande.**
**Estado: APROBADO (2026-06-25).** Motor: Express + nodemailer. SMTP: Gmail "SMTP CRM".

> SUPERSEDE: este documento reemplaza la **Fase 2 de `crm-n8n-automations`** (secciones 2.1–2.3
> del diseño y tasks de citas). La arquitectura n8n queda obsoleta para citas. Las Fases 0+1
> (credenciales, emisor HMAC, workflows `user.invited` y `password.reset_requested`) siguen
> operativas e intactas — este change NO las toca.
>
> NOTA PARA MANTENEDORES: actualizar `openspec/changes/crm-n8n-automations/tasks.md` Fase 2
> con "SUPERSEDED por crm-citas-supabase" y marcar las tareas 2.1–2.3 como canceladas.

---

## 0. Estado real del repo (base del diseño)

- **Stack**: Express 4 + Prisma 5, ESM (`"type":"module"`, imports `.js`), `tsx`. Supabase Auth (ES256/JWKS).
- **`lib/automation` no existe**: eliminada en migración Supabase. Único contenido de `lib/`: auth, availability, business, crud, nombre, password, rateLimit, tenant.
- **`back/package.json`**: sin nodemailer. Deps: express, cors, dotenv, zod, jose, @supabase/supabase-js, @prisma/client.
- **`back/src/env.ts`**: solo vars Supabase, Anthropic, port, corsOrigin, frontUrl, trustProxy. Sin vars SMTP.
- **`Notification` model** (tabla `notificacion`): existe en schema, completamente muerto. Campos:
  `id, businessId, tipo, canal, destino, payload Json, programadoEn DateTime?, enviadoEn DateTime?, estado String @default("pending"), createdAt`. Sin uso en ninguna ruta.
- **`bookings.ts`**: `POST /` crea `status:'PENDING'`, retorna booking con `include: { service, customer, employee, resources }`. Transición `no-show`: `transition(req, res, 'NO_SHOW')` — actualiza status + crea `BookingStatusHistory`. Sin lógica de email hoy.
- **`Customer`**: tiene `email String?` y `consentimientoComms Boolean @default(false)`. Email de cita es transaccional → NO requiere consentimientoComms.

---

## 1. Arquitectura del transporte de email

### 1.1 Principio rector

**El CRM nunca depende del email para funcionar.** El envío es best-effort: si SMTP falla, la operación de negocio (crear cita, marcar no-show) tiene éxito igualmente. Los errores de envío se loguean pero no se propagan.

### 1.2 Módulo `back/src/lib/email.ts`

```ts
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Retorna true si el email se envió, false si SMTP no está configurado o falló.
// NUNCA lanza.
export async function sendEmail(payload: EmailPayload): Promise<boolean>
```

Lógica:
- Si `env.smtpHost` vacío o `emailEnabled=false` → loguea "email deshabilitado" → devuelve false.
- Crea transporter nodemailer (host, port, secure, auth.user, auth.pass).
- `transporter.sendMail(...)` en try/catch.
- Catch: loguea error (solo `to` y `subject`, sin HTML) → devuelve false.
- Éxito → true.

### 1.3 Variables de entorno (añadir a `env.ts` y `.env.example`)

```ts
smtpHost:    process.env.SMTP_HOST    ?? '',
smtpPort:    Number(process.env.SMTP_PORT ?? 587),
smtpSecure:  process.env.SMTP_SECURE === 'true',   // false para STARTTLS (587)
smtpUser:    process.env.SMTP_USER    ?? '',
smtpPass:    process.env.SMTP_PASS    ?? '',        // Gmail App Password (cuenta "SMTP CRM")
smtpFrom:    process.env.SMTP_FROM    ?? '',        // "CRM <noreply@...>"
emailEnabled: process.env.EMAIL_ENABLED !== 'false',// default true; false en tests
```

Default seguro: `smtpHost` vacío → no-op. No bloquea el arranque (soft-fail by design).

---

## 2. Automatización 1: `booking.confirmed`

### 2.1 Disparador

`POST /bookings` — después del `prisma.$transaction` que crea la cita, en el response path (fire-and-forget). La cita nace `PENDING`, que para bookings manuales de staff ES la confirmación. **No se introduce transición CONFIRMED.**

### 2.2 Payload

```ts
{
  to: booking.customer?.email ?? '',     // sin email → skip silencioso
  subject: `Cita confirmada — ${service.nombre}`,
  html: confirmedTemplate({ customerName, serviceName, startsAt, employeeName?, businessName }),
}
```

PII en `html`: nombre cliente, servicio, fecha/hora. Sin email/teléfono/IDs en el texto.

### 2.3 Integración

```ts
void sendEmail(buildConfirmedEmail(result.booking)).catch(() => {/* ya logueado */});
```

No bloquea la respuesta 201. Sin email del cliente → skip.

---

## 3. Automatización 2: `booking.reminder` (24h y 2h)

### 3.1 Cola persistente: modelo `Notification`

Cambio de esquema (migración aditiva):

```prisma
model Notification {
  // ... campos existentes ...
  @@unique([tipo, businessId, destino, programadoEn])   // NUEVO — idempotencia
  @@index([programadoEn, estado])                        // ya existe
  @@map("notificacion")
}
```

`tipo` = `"booking.reminder.24h"` | `"booking.reminder.2h"`. El `@@unique` evita recordatorios duplicados; insert duplicado → upsert ignora (P2002).

> CAVEAT (revisión Ruflo 2026-06-25): `destino` y `programadoEn` son nullable en el modelo. En Postgres
> los NULL se consideran distintos, así que el `@@unique` NO garantiza unicidad si alguna fila lleva
> NULL en esos campos. Por contrato de uso, las filas de recordatorio SIEMPRE setean `destino` (email)
> y `programadoEn` (calculado) — nunca NULL — por lo que la idempotencia está cubierta para este change.
> Si en el futuro se usa `Notification` para otros tipos con campos NULL y se requiere unicidad,
> migrar a un índice único parcial (`WHERE destino IS NOT NULL AND programado_en IS NOT NULL`). Deuda anotada.

Payload JSON: `{ bookingId, customerName, serviceName, startsAt, employeeName? }`. Sin email en payload (va en `destino`).

### 3.2 Inserción al crear el booking

En `POST /bookings`, tras crear:

```ts
const reminders = [
  { offset: 24*60*60*1000, tipo: 'booking.reminder.24h' },
  { offset: 2 *60*60*1000, tipo: 'booking.reminder.2h'  },
];
for (const { offset, tipo } of reminders) {
  const programadoEn = new Date(booking.startAt.getTime() - offset);
  if (programadoEn > new Date()) {
    await prisma.notification.upsert({
      where: { tipo_businessId_destino_programadoEn: { tipo, businessId, destino: customerEmail, programadoEn } },
      create: { businessId, tipo, canal: 'email', destino: customerEmail, payload, programadoEn, estado: 'pending' },
      update: {},
    });
  }
}
```

### 3.3 Drainer (`back/src/lib/reminderDrainer.ts`)

`setInterval` cada 60 s (`REMINDER_DRAINER_INTERVAL_MS`). Por iteración:
1. `findMany({ where: { estado:'pending', programadoEn:{ lte: now }, canal:'email' }, take: 50 })`.
2. Por fila:
   a. Verificar booking activo: `findFirst({ where: { id: payload.bookingId, status: { not:'CANCELLED' }, eliminadoEn: null } })`. Si no → `estado:'skipped'`.
   b. `sendEmail(buildReminderEmail(row))`.
   c. Éxito → `estado:'sent', enviadoEn: now`. Fallo → `estado:'failed'` + log. Sin retry en MVP (deuda).
3. Excepción global → log + continuar.

Nunca para el proceso.

### 3.4 Arranque en `server.ts`

```ts
import { startReminderDrainer } from './lib/reminderDrainer.js';
startReminderDrainer(); // tras app.listen
```

---

## 4. Automatización 3: `booking.no_show`

`POST /bookings/:id/no-show` → `transition(req, res, 'NO_SHOW')`. Tras actualizar status + history:

```ts
void sendEmail(buildNoShowEmail(booking)).catch(() => {});
```

Payload: `{ to: customer?.email, subject: 'Esperamos verte pronto — ...', html: noShowTemplate(...) }`. Texto amable que invita a reprogramar. Sin datos internos.

---

## 5. Plantillas (HTML inline, español)

Strings TS en `email.ts`: `confirmedTemplate`, `reminderTemplate(data, '24h'|'2h')`, `noShowTemplate`. HTML mínimo, sin imágenes externas ni tracking pixels. Evolución: motor de plantillas (Handlebars/MJML) para branding.

---

## 6. Seguridad y PII

| Riesgo | Mitigación |
|---|---|
| PII en payload Notification | Solo customerName, serviceName, startsAt, employeeName. Email en `destino` aparte. |
| PII en logs | `sendEmail` loguea solo `to` y `subject`; nunca el HTML. |
| SMTP credentials | Solo en `.env` (no committed). `.env.example` documenta sin valores. |
| Marketing sin consentimiento | Solo transaccional de citas — no aplica `consentimientoComms`. Si se añade marketing, DEBE verificarlo. |
| Drainer con bookings cancelados | Verificación activa: booking inexistente/CANCELLED/eliminado → `skipped`, sin enviar. |

---

## 7. Plan por fases

### Fase A — Transporte (unidad segura, inerte hasta configurar SMTP)
1. nodemailer + @types/nodemailer.
2. Vars SMTP en env.ts + .env.example (`EMAIL_ENABLED=false` en dev/test).
3. `lib/email.ts` con `sendEmail` + plantillas. Sin integración aún.
4. Unit tests: SMTP vacío → no-op; SMTP mock → llama transporter.

### Fase B — Cola de recordatorios
1. Migración Prisma `@@unique` (+ businessId si falta). `prisma generate`.
2. `lib/reminderDrainer.ts`. Arranque en `server.ts`.
3. Tests: DB vacía sin crash; pending → sendEmail; cancelled → skipped; idempotencia.

### Fase C — Puntos de emisión en bookings
1. `POST /` — fire-and-forget confirmación + upsert 2 filas Notification.
2. `POST /:id/no-show` — fire-and-forget no-show.
3. Tests e2e: crear booking → email; no-show → email; idempotencia; fallo suave.

### Verificación
- V.1 confirmación enviada (SMTP real). V.2 reminders programados + enviados. V.3 no-show enviado.
- V.4 idempotencia 0 duplicados. V.5 fallo suave (SMTP caído → 201/200). V.6 tsc + tests verde.

---

## 8. Decisiones de arquitectura

1. Transporte en proceso Express, no infra nueva. Coherente con el viejo `lib/automation`.
2. `Notification` repurposeado como cola — ya existe, 0 migración destructiva.
3. Idempotencia por `@@unique` — el upsert absorbe duplicados.
4. Fallo suave por diseño: `sendEmail` nunca lanza; drainer nunca para el proceso.
5. No CONFIRMED transition: cita nace PENDING = confirmada para uso manual.
6. PII mínimo: payload sin email; plantillas solo nombre + servicio + fecha.
7. Default seguro: `EMAIL_ENABLED=false` en tests; `smtpHost` vacío → no-op.

---

## 9. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| SMTP caído | Bajo (soft-fail) | Booking nunca falla por email; se loguea. |
| Drainer multi-réplica → duplicados | Medio | Deuda; `SELECT FOR UPDATE SKIP LOCKED` en evolución. |
| Gmail límite ~500/día | Bajo MVP | Aceptable. Evolución: Resend/SendGrid. |
| Booking reprogramado → reminder viejo | Medio | Filas se saltan si cancelado; mejora: cancelar filas pending en PATCH. Deuda. |
| PII en logs SMTP | Bajo | Solo `to` y `subject`. |
