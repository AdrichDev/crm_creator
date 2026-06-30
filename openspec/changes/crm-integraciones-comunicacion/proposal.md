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

## Priorización sugerida

| Prioridad | Integración | Motivo |
|-----------|-------------|--------|
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
  └── /api/integrations/:tipo/connect   → OAuth2 redirect
  └── /api/integrations/:tipo/callback  → guarda tokens en DB (tenant-scoped)
  └── /api/integrations/:tipo/send      → envío de mensajes

n8n (ya en proyecto)
  └── Workflow "recordatorio-cita"      → WhatsApp 24h antes (trigger: citas.created_at)
  └── Workflow "email-confirmacion"     → Gmail al crear cita
  └── Workflow "gcal-sync"             → Google Calendar bidireccional

DB: tabla `tenant_integrations`
  - tenant_id, tipo (gmail|whatsapp|gcal), access_token, refresh_token, config JSONB
```

### Relación con n8n existente
n8n ya está en el proyecto para el flujo de invitaciones/contraseñas. Es el canal natural para los workflows de comunicación sin reescribir lógica en el backend del CRM.

---

## Nivel de riesgo
**Level 3 (Large)** — Requiere:
- OAuth2 por integración (Google requiere verificación de app si es producción)
- Gestión segura de tokens por tenant
- Costes de API (WhatsApp Business: ~0,05 €/conversación; Gmail: gratuito con OAuth)
- Número de WhatsApp Business certificado (24-48 h de activación)

## Estado
**Propuesta** — Pendiente de aprobación y priorización por el usuario.
