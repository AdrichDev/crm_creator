# Tasks — crm-n8n-automations   (Nivel 3 — todas PENDING)

## Fase 0 — Infra
- [~] 0.1 Servicio `n8n` añadido a `docker-compose.yml` (perfil `n8n`, vol `crm_n8n_data`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, secreto compartido). PENDIENTE humano: `docker compose --profile n8n up -d`, crear API key en la UI, fijar `N8N_API_URL`/`N8N_API_KEY`. Setup en `n8n/README.md`.
- [x] 0.2 Definir `AUTOMATION_WEBHOOK_SECRET` y firma HMAC en el backend (`lib/automation/signer.ts` sign/verify sobre `timestamp.body`; env keys en `env.ts`).
- [x] 0.3 Capa `lib/automation` en el back: `emit(name, data, {businessId, eventId?})` con `eventId` (idempotencia), retry con backoff, timeout y FALLO SUAVE (nunca throw; no-op si `AUTOMATION_WEBHOOK_URL` vacío). Eventos `user.invited`, `password.reset_requested`. (Cola persistente en Postgres → diferida; emisor en proceso por ahora.)

## Fase 1 — Credenciales (prioritario, sostiene auth)
- [x] 1.1 Flujo "email alta usuario" (rama `user.invited` del dispatcher) + plantilla `n8n/templates/user-invited.html`. Workflow `n8n/workflows/crm-automation-dispatcher.json` (validado `valid:true`, 0 errores). PENDIENTE humano: importar + asignar credencial SMTP + activar.
- [x] 1.2 Flujo "recuperación de contraseña" (rama `password.reset_requested`) + plantilla `n8n/templates/password-reset-requested.html`. Misma importación.

## Fase 2 — Citas
- [ ] 2.1 Recordatorio de cita (24 h / 2 h). - [ ] 2.2 Confirmación de reserva. - [ ] 2.3 No-show seguimiento.

## Fase 3 — Facturación / ventas
- [ ] 3.1 Factura por email (PDF). - [ ] 3.2 Aviso factura pendiente/vencida. - [ ] 3.3 Resumen diario de caja. - [ ] 3.4 Stock bajo → proveedor.

## Fase 4 — Clientes / marketing
- [ ] 4.1 Cumpleaños. - [ ] 4.2 Reactivación inactivos. - [ ] 4.3 Reseña post-servicio. - [ ] 4.4 Renovación de bono.

## Fase 5 — Equipo / estudios
- [ ] 5.1 Aprobación de vacaciones (ida/vuelta). - [ ] 5.2 Resumen de fichajes. - [ ] 5.3 Estudio de mercado programado por email.

## Verificación
- [ ] V.1 Cada flujo: prueba de envío + idempotencia (no duplica) + fallo suave si n8n cae. [BLOQUEADA — requiere n8n arriba (0.1) + desbloqueo SSRF del MCP. Workflow validado en estático (`validate_workflow` → valid:true). Pasos manuales en `n8n/README.md`.]
- [~] V.2 Revisión seguridad: firma webhook (✓ HMAC-SHA256 timingSafe + anti-replay 5 min + idempotencia por eventId en el dispatcher), PII en plantillas (✓ solo firstName + enlace token, sin password ni logs de data). PENDIENTE: rate limit en el webhook n8n (config de instancia/reverse-proxy).
