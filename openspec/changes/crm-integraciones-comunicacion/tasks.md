# Tasks - crm-integraciones-comunicacion

Fuente canonica: `specs/communication-integrations/spec.md` + `design.md`. Implementacion grande: aplicar solo tras decidir estrategia de cadena.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900-1500 aprox. |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | WU0 -> WU1 -> WU2 -> WU3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| WU0 | Caracterizar notify-infra existente | PR 1 | Tests, sin cambio funcional. |
| WU1 | Infra OAuth compartida + Gmail | PR 2 | Base de credenciales. |
| WU2 | WhatsApp delegado a n8n | PR 3 | Depende de WU1. |
| WU3 | Calendar tenant + admin | PR 4 | Depende de WU1. |

## WU0 - notify-infra
- [ ] **T0.1** - Probar via unica: webhook -> `emit()`; vacio -> SMTP; nunca ambas.
- [ ] **T0.2** - Probar soft-fail: `notifyBooking*` no lanza y devuelve `boolean`.
- [ ] **T0.3** - Probar idempotencia por `eventId`: reintento -> `skipped/duplicate`.
- [ ] **T0.4** - Probar firma HMAC y bloqueo `blocked_no_secret` sin secreto.

## WU1 - OAuth compartido + Gmail
- [ ] **T1.1** - Migracion Prisma aditiva `OAuthCredential` en schema `crm` con `estado`/`revokedAt`.
- [ ] **T1.2** - Crear `back/src/lib/crypto.ts` AES-256-GCM + tests round-trip/authTag invalido.
- [ ] **T1.3** - Crear `integrations/oauth.ts`: `getValidToken`, refresh perezoso, lock, callback, soft-revoke.
- [ ] **T1.4** - Crear providers Google para `gmail.modify` y `calendar.events`.
- [ ] **T1.5** - Crear rutas `/:servicio/connect`, `callback`, `revoke`; validar scope y 422 si falta.
- [ ] **T1.6** - Integrar Gmail en `notify.ts`; ante `ReauthRequiredError`, fallback sin lanzar.
- [ ] **T1.7** - Agregar eventos `integracion.reauth_requerido`, `scope_insuficiente`, `fallo_proveedor`.

## WU2 - WhatsApp delegado
- [ ] **T2.1** - Soportar `servicio='whatsapp'`: credencial marcador, sin OAuth real ni SDK Twilio.
- [ ] **T2.2** - Reusar `disconnectIntegration` para revoke soft-delete WhatsApp.
- [ ] **T2.3** - Emitir evento WhatsApp a n8n con `businessId`; sin esperar respuesta ni reintentar.

## WU3 - Calendar
- [ ] **T3.1** - Soportar `servicio='calendar'` tenant y admin (`businessId=null`, `scope='admin'`).
- [ ] **T3.2** - Anadir/reusar gate operador para filas admin `businessId=null`.
- [ ] **T3.3** - Crear poller de sync Calendar -> `crm.reserva` usando `getValidToken()`.
- [ ] **T3.4** - Crear evento Calendar al confirmar cita; fallo de sync no bloquea.

## Validacion transversal
- [ ] **V.1** - Verificar aislamiento T1/T2 y `businessId` en queries `oauth_credential`.
- [ ] **V.2** - Verificar que credencial admin no aparece en listados tenant.
- [ ] **V.3** - Verificar fallback Gmail revocado -> `notify.ts`.
- [ ] **V.4** - Verificar refresh perezoso con margen 60s y lock anti-carrera; sin drainer de refresh.
- [ ] **V.5** - Verificar tokens cifrados `enc:v1:...`, nunca en claro.
- [ ] **V.6** - Verificar revoke soft-delete: `estado='revoked'` + `revokedAt`.
