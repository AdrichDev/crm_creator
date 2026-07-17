# Validation — crm-tenant-oauth-creds-and-mail-connector

## User story

Como plataforma multi-tenant, quiero que (1) cada tenant pueda opcionalmente traer
su propio proyecto Google (client_id/secret) para OAuth de Gmail-send/Calendar,
cayendo a la app central si no lo trae, y (2) cualquier tenant con correo de otro
proveedor (Hostinger, Zoho, cPanel…) pueda conectar su buzón por IMAP/SMTP para
enviar y (a futuro) leer — todo sin auditoría CASA y sin filtrar secretos al export.

## Acceptance criteria — Fase 1

- **AC1**: `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` existen como slots
  del catálogo de secretos por-tenant, `BACKEND_SECRET`, sin `envVarName`, cifrados
  en `TenantSecret`.
- **AC2**: `googleOAuthConfig(businessId)` devuelve las creds del tenant si están;
  si faltan ambas → las del env central; si está una sola → error
  `IncompleteTenantOAuthError` (nunca mezcla tenant+central).
- **AC3**: `authorizationUrl`, `handleCallback` y el refresh usan las creds resueltas
  por `businessId`; un tenant sin creds propias funciona **idéntico** a hoy (app
  central).
- **AC4**: el flujo "Conectar Google Calendar" funciona con las creds resueltas
  (central o tenant) y persiste el `OAuthCredential` cifrado como hoy.
- **AC5 (no export)**: ningún export (web/apk/ipa/exe) contiene `GOOGLE_OAUTH_*`;
  el `client_secret` nunca sale del back.
- **AC6**: "Probar" valida las creds sin revelar el secreto en la respuesta.

## Acceptance criteria — Fase 2

- **AC7**: existen 6 slots de correo (`MAIL_ADDRESS`, `MAIL_APP_PASSWORD`,
  `IMAP_HOST/PORT`, `SMTP_HOST/PORT`), `BACKEND_SECRET`, cifrados; puertos con
  defaults sanos.
- **AC8**: `sendViaTenantSmtp(businessId, msg)` envía por el SMTP del tenant con sus
  creds; un tenant con `MAIL_*` configurado hace que `notify.ts` use su SMTP antes
  del central; sin `MAIL_*` → SMTP central (regresión cero).
- **AC9**: `readTenantInbox(businessId)` lee cuerpos por IMAP (imapflow) con timeout
  duro; sin config → error claro, nunca cuelga.
- **AC10**: `testMailConnection` verifica IMAP (login) + SMTP (verify); rate-limit
  5/min; timeout; el panel autocompleta host/puerto por dominio conocido y avisa
  "Gmail/Outlook → usa OAuth".
- **AC11 (seguridad)**: `MAIL_APP_PASSWORD` cifrado AES-256-GCM en `TenantSecret`,
  nunca en logs, nunca al export, `reveal` solo admin.

## Given-When-Then

**Escenario 1 (AC2/AC3): tenant trae su proyecto Google**
Given un tenant con `GOOGLE_OAUTH_CLIENT_ID` + `_SECRET` guardados en sus secretos
When conecta Google Calendar
Then `authorizationUrl` se construye con las creds del tenant (no las centrales)
And el callback intercambia el code con esas mismas creds
And el `OAuthCredential` queda cifrado como hoy.

**Escenario 2 (AC3 regresión): tenant sin creds propias**
Given un tenant sin `GOOGLE_OAUTH_*` en sus secretos
When conecta Google Calendar
Then se usan las creds del env central (comportamiento idéntico al actual).

**Escenario 3 (AC5 no-export): el secreto no se filtra**
Given un tenant con `GOOGLE_OAUTH_CLIENT_SECRET` guardado
When se genera cualquier export (web/apk/ipa/exe)
Then el `.env.local` del artefacto NO contiene `GOOGLE_OAUTH_*` ni el secreto.

**Escenario 4 (AC8): envío por SMTP del tenant**
Given un tenant con `MAIL_ADDRESS`/`_APP_PASSWORD`/`SMTP_HOST`/`SMTP_PORT` (Hostinger)
When el CRM manda una notificación
Then sale por el SMTP del tenant (firmado desde su dominio), no por el SMTP central.

**Escenario 5 (AC2): creds incompletas**
Given un tenant con `GOOGLE_OAUTH_CLIENT_ID` pero sin `_SECRET`
When se resuelve la config OAuth
Then se lanza `IncompleteTenantOAuthError` (no cae al central a medias).

## Test por tarea

- T1.1 → catálogo (2 slots, scope, sin envVarName).
- T1.2 → `googleOAuthConfig` tenant>central>error-incompleto.
- T1.3 → 3 call-sites usan creds resueltas; regresión central.
- T1.5 → export NO emite `GOOGLE_OAUTH_*`.
- T1.6 → probar creds sin fugar valor.
- T2.1 → catálogo 6 slots + defaults.
- T2.2 → mail-connector send/read/test/sin-config (mocks).
- T2.3 → notify usa SMTP tenant antes del central.
- T2.4 → autocompletar por dominio + tester mail.
- T3.1 → regresión cero (sin creds → central en ambos).

Regla del repo: tarea DONE solo con su test verde; sin spec, cambios revertidos.
