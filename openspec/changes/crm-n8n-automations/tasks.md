# Tasks — crm-n8n-automations   (Nivel 3 — todas PENDING)

## Fase 0 — Infra
- [ ] 0.1 Arrancar n8n (`docker compose --profile n8n up -d`), crear API key, fijar `N8N_BASE_URL`/`N8N_API_KEY`.
- [ ] 0.2 Definir `AUTOMATION_WEBHOOK_SECRET` y verificación de firma en el backend.
- [ ] 0.3 Capa `lib/automation` en el back: emisor de eventos con `eventId` (idempotencia) + retry/fallo suave.

## Fase 1 — Credenciales (prioritario, sostiene auth)
- [ ] 1.1 Flujo n8n "email alta usuario" + plantilla.
- [ ] 1.2 Flujo n8n "recuperación de contraseña" + plantilla.

## Fase 2 — Citas
- [ ] 2.1 Recordatorio de cita (24 h / 2 h). - [ ] 2.2 Confirmación de reserva. - [ ] 2.3 No-show seguimiento.

## Fase 3 — Facturación / ventas
- [ ] 3.1 Factura por email (PDF). - [ ] 3.2 Aviso factura pendiente/vencida. - [ ] 3.3 Resumen diario de caja. - [ ] 3.4 Stock bajo → proveedor.

## Fase 4 — Clientes / marketing
- [ ] 4.1 Cumpleaños. - [ ] 4.2 Reactivación inactivos. - [ ] 4.3 Reseña post-servicio. - [ ] 4.4 Renovación de bono.

## Fase 5 — Equipo / estudios
- [ ] 5.1 Aprobación de vacaciones (ida/vuelta). - [ ] 5.2 Resumen de fichajes. - [ ] 5.3 Estudio de mercado programado por email.

## Verificación
- [ ] V.1 Cada flujo: prueba de envío + idempotencia (no duplica) + fallo suave si n8n cae.
- [ ] V.2 Revisión seguridad: firma webhook, rate limit, PII en plantillas.
