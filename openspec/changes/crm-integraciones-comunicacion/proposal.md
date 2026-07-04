# Propuesta: Integraciones de comunicación en el CRM

## Cambio
`crm-integraciones-comunicacion`

## Contexto
El CRM generado por creador_CRM necesita conectarse con los canales de comunicación que los negocios ya usan: correo, mensajería y agenda. Esto convierte el CRM en el centro de operaciones del negocio en lugar de ser una herramienta aislada.

## Integraciones propuestas

### 1. Gmail (Google Workspace)
**Qué hace:** Enviar y recibir correos desde el CRM, asociando emails a clientes y citas.  
**API:** Google Gmail API (OAuth2, scope `gmail.modify`).  
**Casos de uso:**
- Enviar confirmación de cita al cliente con un clic desde la ficha.
- Recibir y registrar respuestas de email en el historial del cliente.
- Enviar facturas por email desde el módulo de facturación.

### 2. WhatsApp Business API
**Qué hace:** Enviar mensajes de WhatsApp a clientes (recordatorios, confirmaciones, notificaciones de pedido).  
**Proveedor recomendado:** Twilio (el más integrado con n8n, que ya está en el proyecto) o Meta directamente (más barato a largo plazo, más burocrático al activar).  
**Casos de uso:**
- Recordatorio automático de cita 24 h antes.
- Confirmación de reserva con enlace para cancelar.
- Notificación de pedido listo en Retail.

### 3. Google Calendar
**Qué hace:** Sincronización bidireccional de citas del CRM con Google Calendar del negocio.  
**API:** Google Calendar API (OAuth2, scope `calendar.events`).  
**Casos de uso:**
- Crear evento en Google Calendar al confirmar una cita en el CRM.
- Mostrar disponibilidad del equipo cruzando CRM + Google Calendar.
- Sincronizar cancelaciones en ambas direcciones.

---

## Sugerencias adicionales

### 4. SMS (Twilio)
Fallback para clientes sin WhatsApp. Mismo flujo que WhatsApp pero por SMS. Requiere número Twilio de origen. Coste bajo.

### 5. Slack (notificaciones internas)
Para el equipo del negocio: nuevas citas, pagos recibidos, alertas de stock bajo. Sin coste si el negocio ya tiene Slack.

### 6. Stripe / Redsys (pagos)
Cobro online desde el CRM: enviar link de pago al cliente o terminal TPV virtual. Encaja con el módulo Facturación existente.

### 7. Webhook genérico (Make / Zapier)
Para integraciones no previstas: si el negocio usa cualquier otra herramienta (Hubspot, Trello, Notion...), un webhook configurable permite conectarlo sin código.

---

## Arquitectura multi-tenant (OBLIGATORIA — sin credencial compartida)

Cada `Business` (negocio, FK cross-schema a `aa.tenant.id`) tiene sus propias credenciales
OAuth por servicio. Ningún token se comparte entre negocios.

- **Credenciales por negocio**: token Gmail/WhatsApp/Calendar de cada `Business` sirve
  SOLO a ese negocio. Si el negocio T1 conecta su Gmail, el negocio T2 no ve ni usa ese
  token — cada fila de credenciales está scoped a `businessId`, igual que `BusinessSetting`.
- **Credenciales admin (separadas)**: el operador de la plataforma (Adrian) puede tener
  credenciales propias para su calendario personal o automatizaciones globales de
  operación (no de un negocio cliente). Estas viven en fila(s) con `businessId = null`
  y un flag `scope = 'admin'` — nunca se cruzan con las credenciales de un tenant.
- **Aislamiento**: revocar/expirar el token de un negocio no afecta a otro. Un fallo de
  refresh token de T1 no bloquea el envío de T2 (mismo principio fail-soft que notify.ts).

## Fases revisadas

- **Fase 0 — Infra común (notify.ts) — YA HECHO, solo documentar formalmente**:
  vía única activa por despliegue (`AUTOMATION_WEBHOOK_URL` configurada → `emit()` a n8n
  con HMAC; vacía → `sendEmail` directo vía nodemailer), soft-fail (nunca lanza, nunca
  rompe el flujo de negocio), idempotencia por `eventId`, 18 eventos de dominio tipados
  en `events.ts`. Este proposal NO reemplaza esta infra: las integraciones nuevas se
  apoyan en ella (mismo patrón de emisión de eventos hacia n8n).
- **Fase 1 — Gmail OAuth per-tenant**: CRUD de credenciales (`connect`/`callback`/`revoke`
  por `businessId`), validación de scope `gmail.modify`, refresh token automático,
  almacenamiento en `OAuthCredential` (ver tabla abajo).
- **Fase 2 — WhatsApp Business OAuth per-tenant**: credenciales por negocio, pero el
  ENVÍO real no vive en el back del CRM — se resuelve en n8n (Twilio) reutilizando el
  patrón `emit()` existente. El back solo gestiona credenciales y dispara el evento.
- **Fase 3 — Google Calendar per-tenant + admin personal**: credenciales por negocio para
  sync bidireccional de citas, más una credencial admin separada para el calendario
  personal/operativo de Adrian (no ligada a ningún `Business`).
- Fases posteriores (SMS, Slack, Stripe/Redsys, webhook genérico): sin cambios respecto
  a la priorización original; cada una reutiliza el mismo esquema de credenciales
  per-tenant cuando aplique.

## Tabla de credenciales (schema)

Sigue la convención existente del repo (`Business`/`BusinessSetting`: FK por `businessId`,
`@map` a snake_case castellano, `cuid()`). Vive en el schema `crm` (no `aa` — las tablas
de negocio del CRM están en `crm`, con FK cross-schema a `aa.tenant` igual que `Business`):

```prisma
model OAuthCredential {
  id           String    @id @default(cuid())
  businessId   String?   @map("negocio_id")   // null = credencial admin (no de un tenant)
  business     Business? @relation(fields: [businessId], references: [id], onDelete: Cascade)
  scope        String    @default("tenant") @map("scope")   // "tenant" | "admin"
  servicio     String    @map("servicio")                    // gmail | whatsapp | calendar
  accessToken  String    @map("access_token")
  refreshToken String?   @map("refresh_token")
  expiresAt    DateTime? @map("expires_at")
  scopesOauth  String[]  @default([]) @map("scopes_oauth")   // scopes concedidos (p.ej. gmail.modify)
  createdAt    DateTime  @default(now()) @map("creado_en")
  updatedAt    DateTime  @updatedAt @map("actualizado_en")
  @@unique([businessId, servicio])
  @@map("oauth_credential")
}
```

## Criterios de aceptación multi-tenant (Gherkin, resumen — detalle en validation.md)

```gherkin
Feature: Aislamiento de credenciales OAuth por tenant

  Scenario: Conectar Gmail en un negocio no afecta a otro
    Given el negocio T1 y el negocio T2 no tienen credenciales Gmail
    When T1 completa el flujo OAuth y conecta su Gmail
    Then T1 tiene una credencial Gmail activa
    And T2 sigue sin ninguna credencial Gmail

  Scenario: Revocar credencial de un negocio no afecta a otro
    Given T1 y T2 tienen cada uno su credencial WhatsApp propia
    When se revoca la credencial de T1
    Then el envío por WhatsApp de T2 sigue funcionando sin cambios

  Scenario: Credencial admin no se confunde con credencial de tenant
    Given el operador (Adrian) conecta su Google Calendar personal (scope=admin)
    When se listan las credenciales del negocio T1
    Then la credencial admin no aparece en esa lista
```

---

## Priorización sugerida

| Prioridad | Integración | Motivo |
|-----------|-------------|--------|
| ✅ Hecho | notify.ts (Fase 0) | Infra de emisión de eventos ya construida y en producción |
| 🔴 Alta | WhatsApp | Reduce no-shows en citas, el caso de uso más solicitado |
| 🔴 Alta | Google Calendar | Elimina la doble gestión de agenda |
| 🟡 Media | Gmail | Centraliza comunicación escrita |
| 🟡 Media | SMS (Twilio) | Fallback WhatsApp, mismo proveedor |
| 🟢 Baja | Slack | Solo útil para equipos con Slack activo |
| 🟢 Baja | Stripe/Redsys | Requiere alta como proveedor de pagos |
| 🟢 Baja | Webhook genérico | Para casos avanzados |

---

## Arquitectura técnica propuesta

```
CRM back (Express/Node)
  └── /api/integrations/:servicio/connect   → OAuth2 redirect (per-tenant o admin)
  └── /api/integrations/:servicio/callback  → guarda tokens en OAuthCredential (scoped)
  └── /api/integrations/:servicio/send      → envío de mensajes (reutiliza emit() de notify.ts)

n8n (ya en proyecto)
  └── Workflow "recordatorio-cita"      → WhatsApp 24h antes (trigger: citas.created_at)
  └── Workflow "email-confirmacion"     → Gmail al crear cita
  └── Workflow "gcal-sync"              → Google Calendar bidireccional

DB: tabla `oauth_credential` (schema crm) — ver "Tabla de credenciales" arriba.
```

### Relación con n8n existente
n8n ya está en el proyecto para el flujo de invitaciones/contraseñas y para `emit()` de
notify.ts. Es el canal natural para los workflows de comunicación sin reescribir lógica
en el backend del CRM; el back solo gestiona credenciales y dispara eventos.

---

## Nivel de riesgo
**Level 3 (Large)** — Requiere:
- OAuth2 por integración (Google requiere verificación de app si es producción)
- Gestión segura de tokens por tenant, con aislamiento verificado entre negocios
  (ver "Arquitectura multi-tenant" y AC Gherkin) y separación estricta credencial
  de tenant vs. credencial admin
- Costes de API (WhatsApp Business: ~0,05 €/conversación; Gmail: gratuito con OAuth)
- Número de WhatsApp Business certificado (24-48 h de activación)

## Estado
**Propuesta** — Pendiente de aprobación y priorización por el usuario.
