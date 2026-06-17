# Design — crm-n8n-automations

**Nivel Gru: 3 — Grande.** Dependencia externa (n8n), cruza varios dominios, toca seguridad (firma de webhook) y PII.
**Estado: DISEÑO.** Solo diseño — no implementa.

> Este documento es el plano técnico de la integración CRM ↔ n8n. Alineado con `proposal.md` y `tasks.md`.
> Principio rector: **el CRM nunca depende de n8n para funcionar.** n8n es un consumidor de eventos best-effort.

---

## 0. Estado real del repo (base del diseño)

Verificado en `back/`:

- **Stack**: Express 4 + Prisma 5, ESM puro (`"type": "module"`, imports con sufijo `.js`), ejecutado con `tsx`. Node 20 → `fetch` global disponible, **no hace falta axios**.
- **Config**: objeto `env` en `back/src/env.ts` (patrón `process.env.X ?? default`). Aquí se añaden las claves de automatización.
- **Rutas**: `back/src/routes/index.ts` registra CRUD genérico (`crudRouter`) + rutas custom (`bookings`, `time-off`, `packages`, `dashboard`, `auth`, `branding`).
- **Multi-tenant**: todo tras `authenticate` resuelve `businessId`. Cada evento DEBE llevar `businessId`.
- **Entidades reales** (de `routes/index.ts` y `schema.prisma`): `invoice` (`numero`, `cliente`, `servicio`, `fecha`, `total`, `estado`), `product` (`stock`, `stockMinimo`, `supplier`), `booking`, `timeoff`, `customer` (`consentComms`, `email` → relevante para PII/consentimiento), `campaign`.
- **Brechas que el diseño asume**:
  1. `docker-compose.yml` **solo tiene `db-crm`**. El servicio `n8n` (perfil `n8n`) **no existe todavía** → lo añade Fase 0.
  2. **No hay endpoint `forgot/reset`** en `auth.ts` (solo `register`, `login`, `me`). El evento `password.reset_requested` requiere primero ese endpoint (lo aporta el change `crm-gestion-usuarios-auth`, no este). Este diseño define el contrato del evento; quien implemente el reset solo tiene que llamar a `emit(...)`.
  3. No hay cola/Redis ni worker. La "cola" de este diseño es **en proceso, persistida en Postgres** (tabla `AutomationEvent` vía Prisma). Sin nueva infra.

---

## 1. Arquitectura del emisor de eventos (`back/src/lib/automation`)

### 1.1 Objetivo y SRP

Una sola responsabilidad: **publicar eventos de dominio hacia n8n de forma fiable, firmada e idempotente, sin acoplar el CRM a ningún canal de envío** (ni SMTP, ni WhatsApp, ni Slack). El back no sabe *cómo* se notifica; solo *qué pasó*.

### 1.2 Interfaz pública

```ts
// back/src/lib/automation/index.ts
export interface AutomationEmitter {
  emit(event: AutomationEventName, payload: EventPayload, opts?: EmitOptions): Promise<EmitResult>;
}

export interface EmitOptions {
  eventId?: string;      // idempotencia; si se omite → uuid v4
  businessId: string;    // tenant — OBLIGATORIO
  occurredAt?: Date;     // default: now()
}

export type EmitResult =
  | { status: 'queued';   eventId: string }   // persistido, se entregará async
  | { status: 'skipped';  reason: 'disabled' | 'duplicate' };
```

`emit()` **nunca lanza** hacia el caller del CRM. Persiste y devuelve. La entrega real ocurre fuera del request (fallo suave, ver 1.5).

### 1.3 Estructura de archivos (un archivo por responsabilidad — ISP)

```
back/src/lib/automation/
  index.ts        # AutomationEmitter (fachada) + factory según env
  events.ts       # AutomationEventName (union) + tipos de payload por evento
  signer.ts       # firma HMAC-SHA256 + verify (reutilizable por el receptor)
  dispatcher.ts   # entrega HTTP a n8n: fetch + timeout + retry/backoff
  queue.ts        # cola persistente (Prisma AutomationEvent): enqueue, claim, mark
  noop.ts         # emisor inerte cuando AUTOMATION_ENABLED=false (dev/test)
```

### 1.4 Firma HMAC e idempotencia

- **Firma**: cada POST a n8n lleva cabeceras
  - `X-Automation-Event`: nombre del evento.
  - `X-Automation-Id`: `eventId`.
  - `X-Automation-Timestamp`: epoch ms.
  - `X-Automation-Signature`: `hmacSHA256(secret, `${timestamp}.${rawBody}`)` en hex.
  - El secreto es `AUTOMATION_WEBHOOK_SECRET`. Se firma `timestamp.body` (no solo body) para cerrar replay.
- **Idempotencia**: `eventId` es la clave única. Lado CRM: `AutomationEvent.eventId @unique` → segundo `emit` con mismo id devuelve `skipped: duplicate`. Lado n8n: el workflow guarda los `eventId` ya procesados (static data / KV) y descarta repetidos → defensa en profundidad contra reintentos.

### 1.5 Cola persistente, retry y fallo suave

Tabla nueva (migración Prisma) — **único cambio de datos persistentes del change**:

```prisma
model AutomationEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique           // idempotencia
  businessId  String
  name        String                       // AutomationEventName
  payload     Json
  status      String   @default("PENDING") // PENDING | SENT | FAILED | DEAD
  attempts    Int      @default(0)
  lastError   String?
  occurredAt  DateTime @default(now())
  nextRetryAt DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([status, nextRetryAt])
}
```

Flujo:

1. `emit()` → `INSERT` fila `PENDING` (transaccional con la operación de negocio cuando aplique). Devuelve `queued`. **El request del CRM termina aquí: si n8n está caído, el usuario no se entera.**
2. Un **drainer** procesa pendientes:
   - **Modo simple (Fase 0/1)**: `setInterval` en el propio proceso del back (cada ~10 s) que reclama filas `PENDING`/reintentables (`nextRetryAt <= now`), las envía vía `dispatcher`, marca `SENT` o incrementa `attempts`. Suficiente para un único proceso, sin infra extra.
   - **Camino de evolución (documentado, NO en este change)**: si el back escala a varias réplicas, extraer el drainer a un proceso/worker dedicado con claim atómico (`UPDATE ... WHERE status='PENDING' ... RETURNING` o `SELECT ... FOR UPDATE SKIP LOCKED`). La tabla ya está diseñada para ello.
3. **Retry**: backoff exponencial con jitter (p.ej. 30s, 2m, 10m, 1h, 6h). Tras `maxAttempts` (config, default 6) → `DEAD` + `lastError`. Nada se pierde; quedan auditables en BD.
4. **Timeout** de cada POST: 5 s (`AbortController`). Un n8n lento no bloquea el drainer.

### 1.6 Puntos de emisión en el back (no acoplar)

El emisor se invoca desde las rutas/servicios existentes, **después** de que la operación de negocio haya hecho commit. Ejemplos de inserción (no implementar aquí):

- `auth.ts` alta de usuario → `emit('user.created', …)`.
- futuro `auth.ts` reset → `emit('password.reset_requested', …)`.
- `invoices` (crudRouter o ruta dedicada) al pasar a estado emitida → `emit('invoice.issued', …)`.
- `bookings` al confirmar → eventos de cita.
- `time-off` al crear/resolver → `emit('timeoff.requested' | 'timeoff.resolved', …)`.

> Nota: varios de estos hoy usan `crudRouter` genérico. Para emitir en create/update se necesitará un **hook post-operación** en `crud.ts` o mover esas entidades a rutas dedicadas. Decisión de implementación, fuera del scope de diseño; se señala como dependencia.

---

## 2. Contrato de eventos

Envoltura común (todos los eventos):

```jsonc
{
  "eventId": "uuid",
  "name": "invoice.issued",
  "businessId": "biz_123",
  "occurredAt": "2026-06-17T10:00:00.000Z",
  "data": { /* específico del evento, ver abajo */ }
}
```

Convención de nombres: `dominio.hecho_en_pasado` (snake en el hecho), en minúsculas. Versionado por campo `schemaVersion` opcional en `data` cuando el payload cambie de forma incompatible.

| Evento | Disparador | `data` (campos mínimos) | PII |
|---|---|---|---|
| `user.created` | admin/owner crea usuario | `userId, email, firstName, tempPassword?` | email, password temporal |
| `password.reset_requested` | forgot password | `userId, email, resetToken, expiresAt` | email, token |
| `booking.reminder` | scheduler 24h/2h antes | `bookingId, customerId, customerEmail, customerPhone?, serviceName, startsAt, offset:"24h"|"2h"` | email/phone |
| `booking.confirmed` | crear cita | `bookingId, customerEmail, serviceName, startsAt` | email |
| `invoice.issued` | factura emitida | `invoiceId, numero, cliente, clienteEmail, total, fecha, pdfUrl?` | email, importe |
| `invoice.overdue` | scheduler: vencida e impaga | `invoiceId, numero, cliente, clienteEmail, total, diasVencida` | email, importe |
| `stock.low` | producto bajo mínimo | `productId, name, stock, stockMinimo, supplier?` | — |
| `timeoff.requested` | solicitud de vacaciones | `requestId, employeeId, employeeName, from, to, adminEmail` | email |
| `timeoff.resolved` | admin aprueba/rechaza | `requestId, employeeId, employeeEmail, decision:"approved"|"rejected"` | email |
| `study.scheduled` | estudio de mercado programado | `studyId, type, targetEmail, periodicity` | email |

Reglas del contrato:
- **`data` solo lleva lo que la plantilla necesita.** No se vuelca la entidad entera (minimización de PII).
- IDs siempre presentes para que n8n pueda re-consultar la API del CRM (`N8N` → `GET /api/...` con `N8N_API_KEY`) si necesita más datos, en vez de inflar el payload.
- `tempPassword`/`resetToken` viajan **solo** en su evento, nunca se loguean en claro, y la fila `AutomationEvent.payload` que los contenga debe purgarse o enmascararse tras `SENT` (ver 4).

---

## 3. Lado n8n

### 3.1 Modelo de workflows

- **Un workflow por evento** (o por familia: `credentials`, `bookings`, `billing`, `team`). Entrada: nodo **Webhook** con path `/{event}` y validación de firma como primer nodo (Function que recomputa el HMAC; si no coincide → `403`).
- **Selección de canal**: nodo Switch tras la validación, decide email / WhatsApp / Slack según:
  1. preferencia del evento (algunos son siempre email, p.ej. credenciales),
  2. config por `businessId` (tabla de routing en n8n o variable de entorno),
  3. `consentComms` del cliente para eventos de marketing (no transaccionales).
- **Plantillas**: nodos Set/HTML o archivos de plantilla versionados. El render usa solo campos de `data`.

### 3.2 Versionado

- Workflows exportados a JSON y versionados en el repo bajo `infra/n8n/workflows/*.json` (artefacto de implementación, no de este diseño) para revisión y rollback.
- `schemaVersion` en `data` permite a un workflow soportar payloads viejos y nuevos durante una migración.

### 3.3 docker-compose (Fase 0)

Añadir servicio `n8n` bajo perfil `n8n` al `docker-compose.yml` existente (que hoy solo tiene `db-crm`):

```yaml
  n8n:
    image: n8nio/n8n:latest
    profiles: ["n8n"]
    restart: unless-stopped
    ports: ["5678:5678"]
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - WEBHOOK_URL=${N8N_BASE_URL}
    volumes:
      - n8n_data:/home/node/.n8n
```

(Volumen `n8n_data` añadido a `volumes:`.) El secreto `AUTOMATION_WEBHOOK_SECRET` se comparte entre back y los nodos Function de validación de n8n.

---

## 4. Seguridad

| Riesgo | Mitigación |
|---|---|
| Suplantación de eventos | HMAC-SHA256 firmando `timestamp.body`; n8n rechaza firma inválida (403). |
| Replay | `X-Automation-Timestamp` con ventana de tolerancia (±5 min) + dedupe por `eventId` en n8n. |
| Secretos | `AUTOMATION_WEBHOOK_SECRET`, `N8N_API_KEY`, `N8N_ENCRYPTION_KEY` solo en `.env` (nunca en repo). `.env.example` documenta las claves sin valores. |
| PII en plantillas/logs | `data` minimizado; `payload` con credenciales/tokens se **enmascara o purga** tras `SENT`; logs del dispatcher nunca imprimen `data` de eventos de credenciales. Eventos de marketing respetan `consentComms`. |
| Abuso del receptor n8n | Rate limit en el ingreso del webhook (n8n o proxy delante) por `businessId`/IP. |
| n8n re-consulta la API CRM | `N8N_API_KEY` con permisos mínimos (lectura de lo que las plantillas necesitan), no token de owner. |
| Drainer leaking en errores | `lastError` sanitizado (sin secretos); filas `DEAD` revisables sin exponer PII sensible. |

Clasificación: este change **toca seguridad/auth** (firma, credenciales) → requiere revisión `cybersec:blueteam` y aprobación humana antes de habilitar `user.created`/`password.reset_requested` en real.

---

## 5. Variables de entorno (añadir a `back/src/env.ts` y `.env.example`)

```ts
// dentro del objeto env de back/src/env.ts
automationEnabled: process.env.AUTOMATION_ENABLED === 'true',
automationWebhookSecret: process.env.AUTOMATION_WEBHOOK_SECRET ?? '',
automationMaxAttempts: Number(process.env.AUTOMATION_MAX_ATTEMPTS ?? 6),
n8nBaseUrl: process.env.N8N_BASE_URL ?? 'http://localhost:5678',
n8nApiKey: process.env.N8N_API_KEY ?? '',
```

Default `AUTOMATION_ENABLED=false` → en dev/test el emisor es el `noop` (no envía nada real). Nada se rompe si n8n no está levantado.

---

## 6. Plan por fases (alineado con tasks.md)

> **Unidad implementable SEGURA primero**: la capa `lib/automation` con emisor **noop por defecto** y cola persistente. No envía nada real hasta configurar n8n. Cero riesgo para el CRM en producción.

### Fase 0 — Infra + capa base (la unidad segura)
1. Añadir servicio `n8n` (perfil `n8n`) + volumen al `docker-compose.yml`. Crear API key.
2. Añadir claves de env (sección 5) a `env.ts` y `.env.example`.
3. Migración Prisma `AutomationEvent`.
4. Implementar `lib/automation`: `signer`, `events`, `queue`, `dispatcher`, `noop`, `index` (factory). Drainer `setInterval`.
5. Tests: firma/verify, idempotencia (`skipped: duplicate`), fallo suave (n8n caído → fila `PENDING`/retry, request OK).
   → **Con `AUTOMATION_ENABLED=false` esto es inerte y mergeable sin tocar producción.**

### Fase 1 — Credenciales (prioritario, sostiene auth)
- `emit('user.created')` en alta de usuario. Workflow n8n "email alta" + plantilla.
- Contrato `password.reset_requested` listo; su `emit` se conecta cuando exista el endpoint reset (dependencia de `crm-gestion-usuarios-auth`).
- **Human approval** antes de habilitar envío real (toca credenciales).

### Fase 2 — Citas
- `booking.confirmed`, `booking.reminder` (scheduler para 24h/2h), no-show. Workflows + selección de canal (email/WhatsApp).

### Fase 3 — Facturación / ventas
- `invoice.issued` (PDF), `invoice.overdue` (scheduler), resumen diario, `stock.low`.

### Fase 4 — Clientes / marketing
- Cumpleaños, reactivación, reseña, renovación de bono. **Todos respetan `consentComms`.**

### Fase 5 — Equipo / estudios
- `timeoff.requested`/`timeoff.resolved`, resumen de fichajes, `study.scheduled`.

### Verificación transversal (V.1, V.2 de tasks)
- Por flujo: prueba de envío + idempotencia (no duplica) + fallo suave (n8n caído).
- Seguridad: firma del webhook, rate limit, PII en plantillas.

---

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| n8n caído bloquea el CRM | Alto | `emit` solo persiste y vuelve; entrega async; default `noop`. El request de negocio nunca espera a n8n. |
| Drainer `setInterval` no escala a multi-réplica | Medio | Tabla y claim diseñados para extraer a worker con `SKIP LOCKED`; documentado como evolución, no en este change. |
| Eventos duplicados → doble email | Alto (UX/confianza) | Doble dedupe: `eventId @unique` en CRM + memoria de procesados en n8n. |
| Fuga de PII / credenciales | Alto (cumplimiento) | `data` minimizado, purga/enmascarado de `payload` sensible tras `SENT`, logs sin `data` de credenciales, `consentComms` en marketing. |
| `crudRouter` genérico no tiene hook de emisión | Medio | Señalado como dependencia: añadir hook post-op en `crud.ts` o rutas dedicadas para las entidades que emiten. |
| Endpoint reset inexistente | Medio | Contrato del evento definido ya; emisión queda pendiente del change de auth. No bloquea Fase 0/1 de alta. |
| Secreto compartido CRM↔n8n desincronizado | Medio | Una sola fuente (`.env`), validación temprana al arrancar (warn si vacío y `AUTOMATION_ENABLED=true`). |

---

## 8. Decisiones de arquitectura (resumen)

1. **Emisor desacoplado por eventos de dominio**, no por canal. El back ignora SMTP/WhatsApp/Slack.
2. **Cola persistente en Postgres vía Prisma** (`AutomationEvent`), no Redis/broker → sin infra nueva, auditable, evolucionable.
3. **Fallo suave por diseño**: `emit` solo persiste; entrega async con retry/backoff; el CRM nunca depende de n8n.
4. **Idempotencia de doble capa** (`eventId @unique` + dedupe en n8n).
5. **Firma HMAC sobre `timestamp.body`** con ventana anti-replay.
6. **Default seguro** (`AUTOMATION_ENABLED=false`, emisor `noop`) → la capa base se entrega sin riesgo para producción.
