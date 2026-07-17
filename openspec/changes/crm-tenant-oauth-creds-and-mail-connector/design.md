# Design — crm-tenant-oauth-creds-and-mail-connector

## §A. Principio

Reusar el subsistema de secretos por-tenant que ya existe (catálogo + store cifrado
+ CRUD/test + panel). Ambas fases = **nuevos slots de catálogo + resolución
server-side**, no un subsistema nuevo. Nada de secretos al export.

## §B. Fase 1 — Google OAuth per-tenant

### B.1 Slots de catálogo (`tenant-secrets/catalog.ts:8-65`)

Añadir a `TENANT_SECRET_CATALOG`:
```ts
{ name: "GOOGLE_OAUTH_CLIENT_ID",     label: "Google OAuth Client ID",     scope: "BACKEND_SECRET", provider: "google", group: "google" },
{ name: "GOOGLE_OAUTH_CLIENT_SECRET", label: "Google OAuth Client Secret", scope: "BACKEND_SECRET", provider: "google", group: "google" },
```
Sin `envVarName` (nunca se hornean al front). Cifrado por `tenant-secrets/crypto.ts`.

### B.2 Resolución por-tenant (los 3 call-sites)

`providers/google.ts` `googleOAuthConfig(businessId?)` pasa de leer
`process.env.GOOGLE_OAUTH_*` a:
```ts
const clientId = await getTenantSecret(businessId, "GOOGLE_OAUTH_CLIENT_ID", { fallbackEnv: "GOOGLE_OAUTH_CLIENT_ID" });
const clientSecret = await getTenantSecret(businessId, "GOOGLE_OAUTH_CLIENT_SECRET", { fallbackEnv: "GOOGLE_OAUTH_SECRET" });
```
(`getTenantSecret` ya existe en `tenant-secrets/store.ts:108`, devuelve
`{ value, source: 'tenant'|'operator' }`.) El `redirect_uri` sigue central.

Wire en `oauth.ts`: `authorizationUrl(businessId, servicio)` (:277),
`handleCallback(businessId, ...)` (:301) y el refresh en `getValidToken` (:168)
resuelven las creds con el `businessId` de la credencial. **Invariante**: client_id
y secret se resuelven **juntos de la misma fuente** — si el tenant tiene uno pero no
el otro → error `IncompleteTenantOAuthError` (no mezclar tenant+central).

### B.3 Front

- Grupo "Google (OAuth)" en `tenant-keys-panel.tsx` (2 cards: client_id, secret).
- Botón "Conectar Google Calendar" → `POST /api/integrations/calendar/connect` (ya
  existe, `integrations.ts:111`) → consent → callback. Muestra estado
  connected/reauth.
- Nota UX en el panel: "Vacío = usa la app central de la plataforma. Rellena solo si
  traes tu propio proyecto Google Cloud."

### B.4 NO export

`client_secret` es `BACKEND_SECRET` → el guard de nombres reservado
(`tenant-keys.ts:181`) y el hecho de no tener `envVarName` garantizan que
`public-env-secrets.ts` no lo hornee. Test de regresión: el export NO contiene
`GOOGLE_OAUTH_*`.

## §C. Fase 2 — Conector IMAP/SMTP

### C.1 Slots de catálogo

`MAIL_ADDRESS`, `MAIL_APP_PASSWORD`, `IMAP_HOST`, `IMAP_PORT`, `SMTP_HOST`,
`SMTP_PORT` (`BACKEND_SECRET`, group "mail"). Puertos con default (993 IMAP TLS,
465/587 SMTP).

### C.2 Módulo `mail-connector.ts`

```ts
export async function sendViaTenantSmtp(businessId, { to, subject, html }): Promise<void>; // nodemailer con creds del tenant
export async function readTenantInbox(businessId, opts): Promise<MailMessage[]>;            // imapflow, lee cuerpos
export async function testMailConnection(cfg): Promise<{ imap: boolean; smtp: boolean; detail? }>;
```
- Resuelve config vía `getTenantSecret` (los 6 slots). Sin config → no-op / error claro.
- `sendViaTenantSmtp`: nodemailer transport per-tenant (host/port/secure/user/pass).
- `readTenantInbox`: `imapflow` conecta TLS, `mailbox.open('INBOX')`, fetch últimos N,
  parsea cuerpo. Timeout duro. Best-effort, nunca cuelga.

### C.3 Envío: integrar en la cadena

`notify.ts`: cadena de envío pasa a **Gmail OAuth → SMTP tenant (nuevo) → SMTP
central**. Si el tenant tiene `MAIL_*` configurado, usa su SMTP antes del central.

### C.4 UX: autocompletar proveedores

Tabla estática `COMMON_MAIL_PROVIDERS` (Hostinger, Zoho, cPanel, IONOS, GoDaddy →
imap/smtp host+puerto). El front, al detectar el dominio del correo, autocompleta
host/puerto; el usuario solo pone correo + app-password. Aviso: "Gmail/Outlook → usa
el botón OAuth, no IMAP".

### C.5 Test de conexión

`provider-test.ts`: nuevo tester `mail` → `testMailConnection` (IMAP login + SMTP
verify). Rate-limit 5/min ya existente. Timeout.

## §D. Estrategia de test (node:test — el back del CRM usa `node --test`, NO vitest)

- **F1**: catálogo tiene los 2 slots (BACKEND_SECRET, sin envVarName);
  `googleOAuthConfig` resuelve tenant>central (mock `getTenantSecret`); uno-sin-otro
  → error; export NO incluye `GOOGLE_OAUTH_*` (regresión sobre allowlist).
- **F2**: `mail-connector` con imapflow/nodemailer mockeados — send usa creds del
  tenant; read parsea; `testMailConnection` imap+smtp; sin config → error claro;
  catálogo tiene los 6 slots. `notify.ts` usa SMTP tenant antes del central.
- Regresión: tenant sin creds Google → sigue usando la app central (comportamiento
  idéntico al actual); tenant sin `MAIL_*` → SMTP central como hoy.

Regla del repo: tarea DONE solo con su test verde; sin spec, cambios revertidos.
