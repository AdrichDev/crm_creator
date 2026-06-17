# Spec — Automatizaciones n8n (Fase 0 + Fase 1, DESPLEGADO Y VERIFICADO)

> Documenta lo ya entregado y verificado e2e (2026-06-17). Fases 2–5 pendientes (ver `tasks.md`).

## UC-1 — Emisión de eventos de dominio firmados
**WHEN** el back ejecuta `emit(name, data, {businessId, eventId?})`
**THEN** publica un POST firmado a `AUTOMATION_WEBHOOK_URL` (único webhook de n8n), con fallo suave.

- AC-1.1 Firma `X-Automation-Signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`)` hex; `rawBody = JSON.stringify(envelope)` compacto.
- AC-1.2 Idempotencia por `eventId` (memoria de proceso + dedup en n8n).
- AC-1.3 **Fallo suave**: si n8n cae o el secreto falta, `emit` no lanza; el flujo del CRM no se rompe.
- AC-1.4 Sin `AUTOMATION_WEBHOOK_URL` → no-op (`skipped: disabled`).

## UC-2 — Dispatcher n8n verifica y enruta
**WHEN** llega un POST al webhook `/webhook/crm-automation`
**THEN** el dispatcher verifica firma + frescura + idempotencia y enruta por `name` al email correspondiente.

- AC-2.1 Firma válida + fresca (≤5 min) + no duplicada → 200 y se envía el email del evento.
- AC-2.2 Firma inválida o secreto incorrecto → **401**, sin email.
- AC-2.3 `eventId` repetido → ruta `duplicate`, 200, **sin** reenviar email.
- AC-2.4 Requiere en el contenedor n8n: `NODE_FUNCTION_ALLOW_BUILTIN=crypto` y `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.

## UC-3 — Emails de credenciales (Fase 1)
**WHEN** el evento es `user.invited` (alta de admin/empleado) o `password.reset_requested` (olvido)
**THEN** n8n envía el email con plantilla + branding del tenant + emoji + fecha de caducidad legible.

- AC-3.1 `user.invited` → email con enlace `set-password` (token un solo uso). VERIFICADO (envío `success`).
- AC-3.2 `password.reset_requested` → email con enlace `reset-password`. VERIFICADO.
- AC-3.3 PII mínima: solo `firstName` + enlace; sin contraseñas en claro, sin logs de `data`.
- AC-3.4 Estilos acordes al cliente: color de marca (`branding.primary/secondary`) + logo (imagen o iniciales). VERIFICADO con 2 brandings distintos.

## Pendiente (Fases 2–5)
Citas, facturación, marketing, equipo — requieren que el back emita los eventos correspondientes (aún sin `emit()`).
