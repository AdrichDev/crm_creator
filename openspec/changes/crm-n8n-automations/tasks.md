# Tasks — crm-n8n-automations   (Nivel 3 — Fase 0+1 DESPLEGADAS Y VERIFICADAS)

## Fase 0 — Infra
- [x] 0.1 n8n operativo (contenedor compartido `n8n-agents-agency`, project `3a_estudio`). Servicio definido también en `docker-compose.yml` del CRM. Env requeridas: `NODE_FUNCTION_ALLOW_BUILTIN=crypto` + `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` + `AUTOMATION_WEBHOOK_SECRET`. API key fijada; despliegue vía REST API (el MCP bloquea localhost por SSRF). Workflow id `iJsa8iZjrjV20abQ` activo.
- [x] 0.2 Definir `AUTOMATION_WEBHOOK_SECRET` y firma HMAC en el backend (`lib/automation/signer.ts` sign/verify sobre `timestamp.body`; env keys en `env.ts`).
- [x] 0.3 Capa `lib/automation` en el back: `emit(name, data, {businessId, eventId?})` con `eventId` (idempotencia), retry con backoff, timeout y FALLO SUAVE (nunca throw; no-op si `AUTOMATION_WEBHOOK_URL` vacío). Eventos `user.invited`, `password.reset_requested`. (Cola persistente en Postgres → diferida; emisor en proceso por ahora.)

## Fase 1 — Credenciales (prioritario, sostiene auth)
- [x] 1.1 Flujo "email alta usuario" (rama `user.invited`) + plantilla `n8n/templates/user-invited.html`. Workflow `n8n/workflows/crm/crm-automation-dispatcher.json`. DESPLEGADO + credencial SMTP `SMTP CRM` (Gmail) asignada + activo. VERIFICADO: email enviado (ejecución n8n `success`).
- [x] 1.2 Flujo "recuperación de contraseña" (rama `password.reset_requested`) + plantilla `n8n/templates/password-reset-requested.html`. VERIFICADO: email enviado.

## Fase 2 — Citas
- [ ] 2.1 Recordatorio de cita (24 h / 2 h). - [ ] 2.2 Confirmación de reserva. - [ ] 2.3 No-show seguimiento.

## Fase 3 — Facturación / ventas
- [ ] 3.1 Factura por email (PDF). - [ ] 3.2 Aviso factura pendiente/vencida. - [ ] 3.3 Resumen diario de caja. - [ ] 3.4 Stock bajo → proveedor.

## Fase 4 — Clientes / marketing
- [ ] 4.1 Cumpleaños. - [ ] 4.2 Reactivación inactivos. - [ ] 4.3 Reseña post-servicio. - [ ] 4.4 Renovación de bono.

## Fase 5 — Equipo / estudios
- [ ] 5.1 Aprobación de vacaciones (ida/vuelta). - [ ] 5.2 Resumen de fichajes. - [ ] 5.3 Estudio de mercado programado por email.

## Verificación
- [x] V.1 VERIFICADO e2e (2026-06-17): envío real (alta+reset, email `success` a achozas9@hotmail.com), idempotencia (ruta `duplicate`, sin reenvío), firma inválida/secreto malo → 401. Fallo suave del emisor cubierto por unit tests del back.
- [~] V.2 Revisión seguridad: firma webhook (✓ HMAC-SHA256 timingSafe + anti-replay 5 min + idempotencia por eventId), 401 ante firma/secreto inválidos (✓ probado), PII en plantillas (✓ solo firstName + enlace token, sin password ni logs de data). PENDIENTE: rate limit en el webhook n8n (config de instancia/reverse-proxy).
