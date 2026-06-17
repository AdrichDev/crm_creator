# Proposal — Automatizaciones con n8n (brainstorm)

**Nivel Gru: 3 — Grande** (dependencia externa, integra varios dominios; cada flujo es Nivel 2).
**Estado: PENDIENTE / brainstorm.**

## Contexto
n8n ya está previsto en infra (docker-compose `--profile n8n`, puerto 5678, webhook + API key).
El backend dispara webhooks a n8n; n8n orquesta email/integraciones sin acoplar el CRM a un SMTP.

## Brainstorm de automatizaciones

### Credenciales / cuenta (sostiene `crm-gestion-usuarios-auth`)
- **Email de alta**: admin crea usuario → n8n envía email con contraseña generada.
- **Recuperación de contraseña**: forgot → n8n envía enlace con token.
- **Bienvenida / verificación de email** al primer login.

### Citas / agenda
- **Recordatorio de cita** (24 h y 2 h antes) por email/WhatsApp/SMS.
- **Confirmación de reserva** al crear cita.
- **No-show / seguimiento**: si la cita se marca no asistida → email de reprogramación.
- **Hueco liberado**: cancelación → avisar a lista de espera.

### Clientes / marketing
- **Cumpleaños**: felicitación + cupón.
- **Reactivación**: cliente sin visita en N meses → campaña.
- **Post-servicio**: pedir reseña/encuesta tras la cita.
- **Carrito/paquete por agotarse**: bono con pocas sesiones → email de renovación.

### Facturación / ventas
- **Factura por email** al emitirla (PDF).
- **Aviso de factura pendiente / vencida** (recordatorio de pago).
- **Resumen diario de caja** al admin (cierre).
- **Stock bajo**: producto bajo mínimo → email/orden al proveedor.

### Equipo / operativa
- **Resumen de fichajes** semanal al admin.
- **Solicitud de vacaciones**: al crearse → email de aprobación al admin; al resolver → email al trabajador.
- **Alertas de objetivos**: KPI fuera de rango → aviso.

### Estudios / IA
- **Estudio de mercado programado**: genera informe IA y lo envía por email periódicamente.
- **Prospección**: nuevos prospects → notificar al comercial.

## Patrón técnico
- Backend emite evento → `POST` webhook n8n (`AUTOMATION_WEBHOOK_SECRET` para firmar).
- n8n decide canal (email/WhatsApp/Slack) y plantilla. Plantillas versionadas en n8n.
- Idempotencia por `eventId` para no duplicar envíos.

## Riesgos
- Secreto del webhook y verificación de firma. Rate limiting. PII en emails (cumplimiento).
- No bloquear el flujo del CRM si n8n cae (cola/retry, fallo suave).
