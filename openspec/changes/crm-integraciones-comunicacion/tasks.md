# Tasks — crm-integraciones-comunicacion

## ESTADO: PROPUESTA — sin iniciar
Solo existe `proposal.md` (Nivel 3, pendiente de aprobación y priorización por el usuario).
Checklist derivada del proposal; NINGUNA tarea iniciada. Sin `validation.md` ni `design.md`.
Requiere aprobación humana (OAuth2, tokens por tenant, costes de API, número WhatsApp certificado).

## Fase 0 — Infra común de integraciones
- [ ] 0.1 Tabla `tenant_integrations` (tenant_id, tipo `gmail|whatsapp|gcal`, access_token,
  refresh_token, config JSONB). Migración aditiva.
- [ ] 0.2 Rutas base: `/api/integrations/:tipo/connect` (OAuth2 redirect),
  `/api/integrations/:tipo/callback` (guarda tokens tenant-scoped),
  `/api/integrations/:tipo/send` (envío).
- [ ] 0.3 Gestión segura de tokens por tenant (no exponer por API de lectura).

## Fase 1 — Prioridad Alta
- [ ] 1.1 WhatsApp Business (Twilio o Meta): recordatorio 24h, confirmación con enlace de
  cancelar, notificación de pedido listo. Workflow n8n "recordatorio-cita".
- [ ] 1.2 Google Calendar (OAuth2 `calendar.events`): crear evento al confirmar cita,
  disponibilidad cruzada, sincronización bidireccional de cancelaciones. Workflow "gcal-sync".

## Fase 2 — Prioridad Media
- [ ] 2.1 Gmail (OAuth2 `gmail.modify`): enviar confirmación/factura, registrar respuestas en
  el historial del cliente. Workflow "email-confirmacion".
- [ ] 2.2 SMS (Twilio): fallback de WhatsApp, mismo flujo, número Twilio de origen.

## Fase 3 — Prioridad Baja (sugerencias)
- [ ] 3.1 Slack: notificaciones internas (nuevas citas, pagos, stock bajo).
- [ ] 3.2 Stripe/Redsys: link de pago / TPV virtual desde Facturación.
- [ ] 3.3 Webhook genérico (Make/Zapier) configurable para integraciones no previstas.

## Verificación
- [ ] V.1 OAuth2 por integración funcionando (connect → callback → tokens guardados).
- [ ] V.2 Envío real por cada canal aprobado (WhatsApp/Calendar/Gmail/SMS).
- [ ] V.3 Revisión seguridad: tokens por tenant, no fuga por API, verificación de app Google.
