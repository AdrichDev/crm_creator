# Proposal — crm-tenant-oauth-creds-and-mail-connector

## Intent

Matar deuda técnica de correo/calendario y quitar dependencia de auditorías de
Google, en dos fases:

- **Fase 1 — Google OAuth per-tenant (client_id/secret configurables).** Hoy el
  `client_id`/`client_secret` de Google son **env central** (una sola app Google
  Cloud para toda la plataforma, `providers/google.ts:53-55`). Se hace que sean
  **resolubles por-tenant** (cada tenant puede traer su propio proyecto Google
  Cloud) con **fallback al env central**. Esto habilita el patrón "trae tu propio
  proyecto" (necesario para app interna Workspace / scopes restringidos futuros)
  sin romper el caso central. Scopes ya correctos: `gmail.send` + `calendar.events`
  (**sensibles, sin CASA**).
- **Fase 2 — Conector universal IMAP/SMTP.** Añade un conector de correo
  provider-agnóstico (Hostinger, Zoho, cPanel, hosting genérico) para **enviar
  (SMTP)** y **leer (IMAP)** desde el buzón del propio tenant, con sus datos de
  servidor + app-password. Cubre el long-tail de proveedores. NO sustituye a OAuth
  en Gmail/Microsoft (que mataron basic-auth: Gmail mar-2025, MS SMTP dic-2026).

## Corrección de arquitectura (con evidencia)

La idea inicial de "inyectar `client_id`/`client_secret` en el export" es
**incorrecta**: el export empaqueta **solo el front**
(`export-builders/{web-zip,apk,ipa,exe}.ts`, ningún allowlist incluye `back/`); el
back que maneja OAuth **se queda en la plataforma**, alcanzado por el front vía
`TENANT_ID`/`TENANT_API_KEY` (`runtime-config-env.ts:27-39`). Meter `client_secret`
en el ZIP = **filtrarlo en cada export** (leak ya sufrido, corregido por el
single-writer `writeFreshEnvLocal`). Por tanto: el `client_secret` es
`BACKEND_SECRET`, vive en `TenantSecret` cifrado y lo resuelve el back en tiempo de
OAuth. **Jamás entra al export.**

## Problemas que resuelve

1. **Un solo proyecto Google para todos** (`google.ts:53-55`, `render.yaml:34-39`).
   Ningún tenant puede usar su propio proyecto → bloquea app interna Workspace y la
   futura lectura sin CASA. `authorizationUrl`/`handleCallback`/refresh
   (`oauth.ts:277,301,168`) no resuelven creds por-tenant.
2. **Correo atado a Gmail OAuth o SMTP central.** `email.ts:23-51` = un solo
   transport nodemailer con env central; `gmail.ts` usa el Gmail OAuth del tenant.
   No hay forma de que un tenant con correo de **otro proveedor** (Hostinger/Zoho…)
   conecte su buzón. Cero capacidad IMAP (sin `imapflow` en `package.json`).

## Scope

### Fase 1 — client_id/secret per-tenant

- **2 slots de catálogo** en `tenant-secrets/catalog.ts`: `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET` (`scope: BACKEND_SECRET`, **sin `envVarName`** — nunca
  se hornean al front). Reusa el store `TenantSecret` (AES-256-GCM,
  `tenant-secrets/crypto.ts`) + API CRUD/test (`tenant-keys.ts`) + panel
  (`tenant-keys-panel.tsx`) YA existentes.
- **Resolución por-tenant** en los 3 call-sites: `googleOAuthConfig()`
  (`google.ts:53-55`) y `oauth.ts` (`authorizationUrl` :277, `handleCallback` :301,
  refresh en `getValidToken` :168) usan
  `getTenantSecret(businessId, 'GOOGLE_OAUTH_CLIENT_ID', { fallbackEnv:
  'GOOGLE_OAUTH_CLIENT_ID' })` → valor del tenant si existe, si no el env central.
- **Front**: grupo "Google (OAuth)" en el panel de keys + botón **"Conectar Google
  Calendar"** (el flujo connect/callback ya existe, `integrations.ts:111,132`).
- **Test**: "Probar" de las creds (validación de formato / intercambio dummy) vía
  `provider-test.ts`.

### Fase 2 — conector IMAP/SMTP

- **Dep**: `imapflow` (leer) + `nodemailer` (ya está, enviar).
- **Slots de catálogo**: `MAIL_ADDRESS`, `MAIL_APP_PASSWORD`, `IMAP_HOST`,
  `IMAP_PORT`, `SMTP_HOST`, `SMTP_PORT` (`BACKEND_SECRET`, cifrados). Mismo store/API/
  panel.
- **Envío por-tenant**: `email.ts`/`notify.ts` usan el SMTP del tenant si está
  configurado, si no el central (cadena de fallback existente).
- **Lectura**: módulo `mail-connector.ts` con `imapflow` — capacidad de leer buzón
  (para análisis del agente). La *invocación* de lectura por el agente se difiere;
  esta fase entrega la **capacidad + test de conexión**.
- **UX**: base de datos interna de proveedores comunes (Hostinger/Zoho/cPanel →
  host+puerto) para autocompletar; el usuario solo pone correo + app-password.
- **Test**: "Probar conexión" IMAP+SMTP en `provider-test.ts`.

### No — fuera de scope

- Leer Gmail/Microsoft por IMAP basic-auth (muerto: Gmail mar-2025, MS ~2022/2026)
  — para esos, OAuth. Documentado, no se implementa aquí.
- Auditoría CASA / scopes restringidos (lectura de Gmail body) — diferido.
- Invocación de lectura de correo por el agente (solo se entrega la capacidad).
- Inyección de `client_secret`/mail-password en el export (prohibido — server-side).

## Risks

- **Secretos de correo/OAuth en BD.** `client_secret`, `MAIL_APP_PASSWORD` = alto
  valor. Mitigación: `TenantSecret` AES-256-GCM (`tenant-secrets/crypto.ts`), nunca
  en logs, nunca al export (allowlist front-only). `reveal` solo admin.
- **Fallback silencioso.** Si un tenant configura client_id pero no secret (o
  viceversa) → estado inconsistente. Mitigación: resolver ambos o ninguno; si uno
  presente y otro no → error claro, cae al central solo si ninguno está.
- **IMAP/SMTP frágil en Gmail/MS.** No ofrecerlo como camino para esos dos (basic
  auth muerto). El panel avisa: "para Gmail/Outlook usa el botón OAuth".
- **provider-test de IMAP/SMTP hace conexión de red saliente.** Rate-limit (ya hay
  5/min) + timeout duro.

## Dependencies

- Store de secretos por-tenant SHIPPED: `tenant-secrets/{catalog,store,crypto}.ts`,
  `routes/tenant-keys.ts`, `front/components/config/tenant-keys-panel.tsx`,
  `provider-test.ts`.
- OAuth existente: `integrations/oauth.ts`, `providers/google.ts`,
  `routes/integrations.ts`, modelo `OAuthCredential`, `CRM_OAUTH_ENCRYPTION_KEY`.
- Envío: `lib/email.ts` (nodemailer), `lib/notify.ts` (cadena Gmail→SMTP).
- `nodemailer` (presente); `imapflow` (nuevo).
