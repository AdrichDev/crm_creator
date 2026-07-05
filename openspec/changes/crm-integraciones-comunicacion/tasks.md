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
Chain strategy: stacked-to-main (WU1 dividido en PR#2.1/2.2/2.3)
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

Chain strategy: stacked-to-main. Split WU1 en 3 slices para respetar el presupuesto de
revision (400 lineas): PR#2.1 (fundacion, HECHO), PR#2.2 (rutas HTTP), PR#2.3 (integracion+eventos).

### PR#2.1 - fundacion OAuth (HECHO, ~903 lineas: ~603 codigo + ~300 tests, 23 tests verdes)
- [x] **T1.1** - Migracion Prisma aditiva `OAuthCredential` en schema `crm` con `estado`/`revokedAt`.
- [x] **T1.2** - Crear `back/src/lib/crypto.ts` AES-256-GCM + tests round-trip/authTag invalido.
- [x] **T1.3** - Crear `integrations/oauth.ts`: `getValidToken`, refresh perezoso, lock, callback, soft-revoke.
- [x] **T1.4** - Crear providers Google para `gmail.modify` y `calendar.events`.

### PR#2.2 - rutas HTTP (HECHO)
- [x] **T1.5** - Rutas `/integrations/:servicio/{connect,callback,revoke}` en `routes/integrations.ts`. Callback publico (identidad en `state` nonce anti-CSRF), connect/revoke con `authenticate+staffOnly` y scoping por `req.businessId`. `ScopeInsufficientError` en callback -> telemetria `integracion.scope_insuficiente` + redirect `estado=scope_insuficiente` (un redirect de navegador no puede devolver 422; el 422 conceptual del design se traduce al `estado` del contrato con la UI). Gate operador para `businessId=null` DIFERIDO a WU3 (en WU1 solo se crean credenciales tenant Gmail; no hay fila admin que proteger todavia).

### PR#2.3 - integracion notify + telemetria (HECHO)
- [x] **T1.6** - Gmail integrado en `notify.ts` via `integrations/gmail.ts::sendGmailMessage` (getValidToken + users.messages.send, MIME base64url). Solo actua en la via SMTP directa (webhook vacio) para no duplicar email cuando n8n enruta; `'missing'` -> SMTP silencioso; `ReauthRequiredError`/`ProviderError` -> telemetria + fallback SMTP sin lanzar.
- [x] **T1.7** - Eventos `integracion.reauth_requerido`, `integracion.scope_insuficiente`, `integracion.fallo_proveedor` en `automation/events.ts` (union + payloads). Emitidos via `emit()` soft-fail desde notify.ts y routes/integrations.ts.

## WU2 - WhatsApp delegado
- [x] **T2.1** - Soportar `servicio='whatsapp'`: credencial marcador, sin OAuth real ni SDK Twilio. (`integrations/whatsapp.ts::connectWhatsApp`, marcador `accessToken=''`; enum/estado/revokedAt ya en schema desde PR#2.1).
- [x] **T2.2** - Reusar `disconnectIntegration` para revoke soft-delete WhatsApp. (`integrations/whatsapp.ts::disconnectWhatsApp`; requirió fix en `oauth.ts::disconnectIntegration` — antes llamaba `asGoogleService()` incondicional y hacía throw para whatsapp; ahora el revoke remoto es solo para gmail/calendar).
- [x] **T2.3** - Emitir evento WhatsApp a n8n con `businessId`; sin esperar respuesta ni reintentar. (`integrations/whatsapp.ts::notifyWhatsAppEvent`, evento `whatsapp.credential_event` en `automation/events.ts`, soft-fail vía `emit()`).

## WU3 - Calendar (HECHO)
- [x] **T3.1** - Rutas admin `POST /admin/:servicio/{connect,revoke}` (solo `calendar`) en `routes/integrations.ts`; tenant ya cubierto por rutas genericas WU1.
- [x] **T3.2** - Gate `requireOperatorToken()` en rutas `/admin/*`; identidad admin viaja en `state` nonce, un tenant no puede forjarlo.
- [x] **T3.3** - Poller `lib/calendarSync.ts`: lista eventos via `getValidToken()`, concilia con `crm.reserva`; tolerante a fallos (token revocado/listado 5xx/evento roto no rompen el lote). Vinculo evento<->reserva via `extendedProperties.private.crmBookingId` (sin migracion). Fix post-AgenticRuntime: `findImportedBooking` (businessId+serviceId marcador+startAt+endAt como clave idempotencia) evita reservas duplicadas si el write-back PATCH falla persistente.
- [x] **T3.4** - `integrations/calendar.ts::createBookingCalendarEvent` enganchado en confirmacion de booking (`routes/bookings.ts`), soft-fail, telemetria en fallo; nunca bloquea la cita.

## Validacion transversal
- [x] **V.1** - Aislamiento T1/T2 verificado: `findCredential` siempre con `businessId` concreto de sesion/nonce; test `whatsapp.test.ts` prueba explicito no-cruce entre tenants.
- [x] **V.2** - Credencial admin (`businessId=null`) excluida del poller por filtro explicito doble (query Prisma + `.filter`), no aparece en listados tenant.
- [x] **V.3** - Fallback Gmail revocado -> `notify.ts` verificado: `ReauthRequiredError`/`ProviderError` -> telemetria + SMTP, nunca lanza.
- [x] **V.4** - Refresh perezoso margen 60s + lock anti-carrera verificado atomico (get-check-set sin await entremedio); test 2 llamadas concurrentes -> 1 sola HTTP.
- [x] **V.5** - Tokens cifrados `enc:v1:...` verificado en persistencia y refresh; logs solo status/error.name/businessId, nunca token.
- [x] **V.6** - Revoke soft-delete verificado: `estado='revoked'` + `revokedAt`, fila persiste.

AgenticRuntime gate (revision fresca, Opus, worktree aislado): WU1+WU2 LIMPIO; WU3 APTO merge con 1 MEDIUM (duplicacion reservas write-back fallido) ya corregido + 2 LOW aceptados (import calendario primario completo, sin paginacion listado >250 eventos — bajo impacto, acotado por ventana `updatedMin`).
