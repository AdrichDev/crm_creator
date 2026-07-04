# Spec - crm-integraciones-comunicacion

Canonico: `specs/communication-integrations/spec.md`. Spec completo, no delta. Ambitos: notify, Gmail, WhatsApp, Calendar.

## Purpose
Integraciones por `businessId` y admin separado; aislamiento, soft-fail e idempotencia.

## Requirements

### Requirement: Via unica activa por despliegue
MUST despachar solo por webhook n8n si `AUTOMATION_WEBHOOK_URL` existe; si no, SMTP.
#### Scenario: Webhook configurado
- GIVEN webhook configurado; WHEN `notifyBookingConfirmed`; THEN usa `emit()` y no SMTP.
#### Scenario: Webhook vacio
- GIVEN webhook vacio; WHEN `notifyBookingConfirmed`; THEN usa SMTP y no `emit()`.

### Requirement: Soft-fail obligatorio
`notifyBooking*` MUST NOT lanzar; MUST devolver `boolean`.
#### Scenario: Fallo de red hacia n8n
- GIVEN n8n caido; WHEN `notifyBookingReminder`; THEN devuelve `false` y negocio continua.

### Requirement: Idempotencia por eventId
MUST deduplicar por `eventId` deterministico.
#### Scenario: Reintento duplicado
- GIVEN `eventId=X` enviado; WHEN reintenta; THEN `skipped/duplicate` y cuenta despachado.

### Requirement: Eventos tipados y firma HMAC
MUST tipar con `AutomationEventName` y firmar webhooks HMAC-SHA256 sobre `timestamp.body`.
#### Scenario: Sin secreto
- GIVEN webhook sin secreto; WHEN `emit()`; THEN `blocked_no_secret` y no envia.

### Requirement: Conexion OAuth2 por negocio
MUST iniciar Gmail OAuth2 por `businessId` con `gmail.modify`.
#### Scenario: Gmail connect
- GIVEN T1 sin Gmail; WHEN admin llama `connect`; THEN Google recibe `state=T1`.

### Requirement: Callback guarda credencial scoped
MUST guardar tokens/scopes en `OAuthCredential` con `businessId` y `scope='tenant'`.
#### Scenario: Callback exitoso
- GIVEN T1 consintio; WHEN Google vuelve; THEN guarda Gmail T1 sin tocar T2.

### Requirement: Validacion de scope concedido
MUST exigir `gmail.modify`; MUST rechazar scope insuficiente.
#### Scenario: Scope insuficiente
- GIVEN solo `gmail.readonly`; WHEN callback procesa; THEN no habilita envio y falla.

### Requirement: Refresh automatico de token
MUST refrescar `accessToken` vencido/proximo antes de enviar.
#### Scenario: Token vencido
- GIVEN token vencido; WHEN envia email; THEN refresca y usa token nuevo.

### Requirement: Fallback si la credencial fue revocada
MUST NOT bloquear si Gmail fue revocado; MUST caer a `notify.ts` y marcar invalida.
#### Scenario: Token revocado
- GIVEN T1 revoco acceso; WHEN refresh falla; THEN fallback sin lanzar y pide reconexion.

### Requirement: Aislamiento entre negocios
MUST impedir leer, usar o revocar credenciales Gmail ajenas.
#### Scenario: Gmail aislado
- GIVEN T1/T2 sin Gmail; WHEN T1 conecta; THEN T1 activo y T2 vacio.

### Requirement: Gestion de credenciales por negocio (sin SDK Twilio en el back)
MUST conectar/revocar WhatsApp por `businessId` sin SDK Twilio backend.
#### Scenario: WhatsApp connect
- GIVEN T1 sin WhatsApp; WHEN registra numero; THEN guarda T1 sin llamar Twilio.

### Requirement: Envio delegado a n8n via evento
MUST emitir evento tipado a n8n; n8n MUST enviar por Twilio.
#### Scenario: Recordatorio 24h
- GIVEN T1 con WhatsApp y cita 24h; WHEN emite recordatorio; THEN payload incluye T1.

### Requirement: Sin reintento en el backend
Backend MUST NOT reintentar WhatsApp; retry vive en n8n.
#### Scenario: Fallo n8n
- GIVEN n8n acepto evento; WHEN Twilio falla alli; THEN backend no reintenta.

### Requirement: Aislamiento entre negocios
Revocar WhatsApp MUST NOT afectar otros negocios.
#### Scenario: WhatsApp aislado
- GIVEN T1/T2 con WhatsApp; WHEN T1 revoca; THEN T2 sigue enviando.

### Requirement: Conexion OAuth2 Calendar por negocio
MUST conectar Calendar por `businessId` con `calendar.events`.
#### Scenario: Calendar connect
- GIVEN T1 sin Calendar; WHEN OAuth2 termina; THEN guarda T1 `scope='tenant'`.

### Requirement: Credencial admin separada
MUST soportar Calendar admin `businessId=null`, `scope='admin'`, invisible para tenants.
#### Scenario: Admin aislado
- GIVEN admin conecta Calendar; WHEN T1 lista credenciales; THEN no aparece.

### Requirement: Sync a crm.reserva via polling
MUST sincronizar cambios externos Calendar a `crm.reserva` mediante polling.
#### Scenario: Evento externo
- GIVEN T1 conectado; WHEN crea evento externo; THEN polling upserta reserva T1.

### Requirement: Crear evento en Calendar al confirmar cita en el CRM
MUST crear evento Calendar al confirmar cita si hay credencial activa.
#### Scenario: Cita confirmada
- GIVEN T1 con Calendar; WHEN confirma cita CRM; THEN crea evento Calendar T1.

### Requirement: Fallo de sync no bloquea el flujo de citas
MUST NOT bloquear confirmacion/cancelacion si Calendar falla.
#### Scenario: Calendar revocado
- GIVEN Calendar revocado; WHEN confirma cita; THEN CRM confirma y sync falla soft-fail.
