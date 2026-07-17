# Tasks — crm-tenant-oauth-creds-and-mail-connector

Fase 1 (OAuth per-tenant) → Fase 2 (IMAP/SMTP). Continuo. Tests con **node:test**
(el back del CRM usa `node --import tsx --test`, NO vitest). DONE solo con test verde.

## Fase 1 — Google OAuth client_id/secret per-tenant

- [x] **T1.1 — Slots de catálogo.** Añadir `GOOGLE_OAUTH_CLIENT_ID` +
  `GOOGLE_OAUTH_CLIENT_SECRET` a `TENANT_SECRET_CATALOG` (`tenant-secrets/catalog.ts`),
  `BACKEND_SECRET`, sin `envVarName`, group "google".
  - Test: catálogo incluye ambos con scope/shape correctos; `inferScope` OK.
  - EVIDENCIA: `catalog.ts` (2 slots + `SecretProvider` 'google' + group 'google');
    verde en `crm-tenant-oauth-creds.test.ts` (T1.1) y `catalog.test.ts` (length 9).
- [x] **T1.2 — Resolución per-tenant en `google.ts`.** `googleOAuthConfig(businessId?)`
  resuelve client_id/secret vía `getTenantSecret(..., { fallbackEnv })`; redirect
  sigue central. Invariante: ambos de la misma fuente; uno-sin-otro →
  `IncompleteTenantOAuthError`.
  - Test: tenant con ambos → usa tenant; sin ninguno → central; uno solo → error.
  - EVIDENCIA: `providers/google.ts` (`resolveClientCreds` + async `googleOAuthConfig`
    + `IncompleteTenantOAuthError`); verde en `crm-tenant-oauth-creds.test.ts` (T1.2).
- [x] **T1.3 — Wire en `oauth.ts`.** `authorizationUrl` (:277), `handleCallback`
  (:301) y refresh (`getValidToken` :168) pasan el `businessId` a la resolución.
  - Test: cada call-site usa las creds resueltas (mock); regresión: businessId sin
    creds tenant → central.
  - EVIDENCIA: `oauth.ts` (`secretDb` en `OAuthDeps`, 4 call-sites `await`,
    `authorizationUrl` async), `integrations.ts` (2 `await`); verde en
    `crm-tenant-oauth-creds.test.ts` (T1.3) + `oauth.test.ts` actualizado.
- [x] **T1.4 — Front: grupo Google + Conectar Calendar.** Grupo "Google (OAuth)" en
  `tenant-keys-panel.tsx` + botón "Conectar Google Calendar" (usa
  `/api/integrations/calendar/connect` existente) + nota UX (vacío=central).
  - Test: typecheck front + verificación visual (panel muestra grupo + botón).
  - EVIDENCIA: `tenant-keys-panel.tsx` (2 cards group 'google' opt-in + botón
    `conectarCalendar` + nota "vacío = app central"), `configuracion/page.tsx`
    (`groups={['ai','maps','database','google']}`), `lib/api/tenant-keys.ts`
    (provider 'google'); `tsc --noEmit` front limpio + 27 tests front verdes.
- [x] **T1.5 — Guard export.** Regresión: el export NO contiene `GOOGLE_OAUTH_*`
  (BACKEND_SECRET, sin envVarName → nunca horneado).
  - Test: `buildEnvContent`/allowlist NO emiten `GOOGLE_OAUTH_*`.
  - EVIDENCIA: estructural (BACKEND_SECRET sin envVarName → `readBakeableSecrets`
    lo excluye por WHERE); verde en `crm-tenant-oauth-creds.test.ts` (T1.5:
    readBakeableSecrets + buildEnvContent sin `GOOGLE_OAUTH_*` ni el secreto).
- [x] **T1.6 — Test de creds.** `provider-test.ts` valida formato de client_id/secret
  (o intercambio dummy) → "Probar".
  - Test: creds válidas → ok; malformadas → error, sin fuga del valor.
  - EVIDENCIA: `provider-test.ts` (case 'google', validación de formato local sin
    red, sin interpolar el value); verde en `crm-tenant-oauth-creds.test.ts` (T1.6).

## Fase 2 — Conector IMAP/SMTP

- [x] **T2.1 — Dep + slots.** Añadir `imapflow` a `back/package.json`; 6 slots de
  catálogo (`MAIL_ADDRESS`, `MAIL_APP_PASSWORD`, `IMAP_HOST`, `IMAP_PORT`, `SMTP_HOST`,
  `SMTP_PORT`), group "mail", puertos con default.
  - Test: catálogo tiene los 6; defaults de puerto.
  - EVIDENCIA: `back/package.json` (`imapflow: ^1.4.7`); `catalog.ts` (6 slots
    BACKEND_SECRET/group 'mail'/sin envVarName, `SecretProvider` +'mail');
    verde en `catalog.test.ts` (length 15 + loop de shape de los 6) y
    `crm-tenant-mail-connector.test.ts` (T2.1: defaults IMAP 993 / SMTP 465).
- [x] **T2.2 — `mail-connector.ts`.** `sendViaTenantSmtp` (nodemailer per-tenant),
  `readTenantInbox` (imapflow, cuerpos, timeout), `testMailConnection` (imap+smtp).
  Config vía `getTenantSecret`; sin config → error claro.
  - Test (imapflow/nodemailer mock): send usa creds tenant; read parsea; test
    imap+smtp; sin config → error; timeout no cuelga.
  - EVIDENCIA: `back/src/lib/mail-connector.ts` (DI `MailConnectorDeps`,
    `resolveMailConfig`, `MailNotConfiguredError`, timeout duro vía `Promise.race`
    en `readTenantInbox` incl. `logout()` envuelto); verde en
    `crm-tenant-mail-connector.test.ts` (T2.2: send con creds tenant, read con
    mock imapflow, test imap+smtp, sin config → `MailNotConfiguredError`, timeout
    no cuelga).
- [x] **T2.3 — Integrar envío en `notify.ts`.** Cadena: Gmail OAuth → **SMTP tenant**
  → SMTP central. Usa SMTP tenant si `MAIL_*` configurado.
  - Test: tenant con `MAIL_*` → SMTP tenant; sin → central (regresión).
  - EVIDENCIA: `notify.ts` (`NotifyDeps.sendViaTenantMail` opcional, cadena de 3
    eslabones en `deliverDirectEmail`, `MailNotConfiguredError` como centinela
    de fallback silencioso); verde en `notify.test.ts` (describe "notify — SMTP
    del tenant (Fase 2)": prioridad SMTP tenant, prioridad Gmail sobre SMTP
    tenant, dep ausente → regresión central, `MailNotConfiguredError` → fallback
    silencioso, error genérico → fallback con warning).
- [x] **T2.4 — Autocompletar proveedores + test.** `COMMON_MAIL_PROVIDERS`
  (Hostinger/Zoho/cPanel/IONOS/GoDaddy) + autocompletar en el panel; tester `mail` en
  `provider-test.ts` ("Probar conexión"). Aviso Gmail/Outlook→OAuth.
  - Test: autocompletar por dominio (unit); tester imap+smtp; typecheck front.
  - EVIDENCIA: `provider-test.ts` (case 'mail', `testMail` opcional en
    `ProviderTestDeps` con fallback `(deps.testMail ?? testMailConnection)`,
    parseo JSON del `value` combinado, sin interpolar el value en `detail`);
    `tenant-keys-panel.tsx` (`COMMON_MAIL_PROVIDERS`, `OAUTH_ONLY_DOMAINS`,
    `suggestMailHosts()`, `probarCorreo()`, card dedicada "Correo (IMAP/SMTP)"
    con aviso OAuth); `configuracion/page.tsx` (`groups` +'mail');
    `lib/api/tenant-keys.ts` (provider +'mail'); verde en
    `crm-tenant-mail-connector.test.ts` (T2.4: case 'mail' ok/ko),
    `tenant-keys-panel.test.tsx` (describe `suggestMailHosts`: 5 tests —
    dominios OAuth→null, Hostinger exacto, Zoho/IONOS exacto, dominio
    desconocido→fallback cPanel, email inválido→null); `tsc --noEmit` front 0
    errores.

## Verificaciones finales

- [x] **T3.1 — Regresión cero.** Tenant sin creds Google → app central idéntica
  (VERIFICADO Fase 1: `crm-tenant-oauth-creds.test.ts` regresión central + suite
  OAuth existente intacta); tenant sin `MAIL_*` → SMTP central idéntico
  (VERIFICADO Fase 2: `notify.test.ts` "dep ausente → regresión central" +
  `MailNotConfiguredError` → fallback silencioso sin cambiar el comportamiento
  de hoy).
- [x] **T3.2 — Typecheck + suite.** Fase 1+2 juntas: `back` `tsc --noEmit` 0
  errores; `npm test` (node:test) = 940 pass / 8 fail PRE-EXISTENTES
  (export-manifest-cruft + export-manifest-snapshot, ya rojos en baseline,
  ajenos a este change, sin nuevos fallos introducidos); `front` `tsc --noEmit`
  0 errores + `vitest run tests/tenant-keys-panel.test.tsx` = 25/25 verdes
  (incluye las 5 nuevas de `suggestMailHosts`).
- [x] **T3.3 — sec-review** (2026-07-17): VERDICT **PASS — seguro para commit**. 63/0 tests + tsc 0. Sin ruta de leak: BACKEND_SECRET sin envVarName excluidos del export a nivel query; AES-256-GCM en reposo; IncompleteTenantOAuthError (no tenant+central mix); IMAP con timeout duro+TLS; secretos nunca en logs/URL/reveal-detail. Report en `sec-review.md`. Warnings no bloqueantes: W1 `/reveal` plaintext sin rate-limit (pre-existente, admin-gated); W2 socket imapflow en connect-timeout (mitigado por finally logout).
  PENDIENTE — no se ejecutó en este segmento porque el contrato de la tarea
  prohíbe commitear; queda como gate HITL antes de mergear.
  - [x] **W1 (2026-07-17): ATENDIDO.** `/reveal` ahora rate-limitado 5/min por
    `businessId:name` (bucket `secret-reveal`), mismo patrón `consume()` que `/test`,
    aplicado tras el gate ADMIN/MANAGER (`tenant-keys.ts` `revealSecretHandler`).
    Tests: 5 pasan / 6º → 429; no-miembro no consume cupo (`tenant-keys.route.test.ts`).
  - [x] **W2 (2026-07-17): ATENDIDO.** `readTenantInbox`/`testMailConnection` fuerzan
    `client.close()` (cierre duro síncrono del socket imapflow) en el catch de error/
    timeout, además del `logout()` best-effort — un connect-timeout ya no puede filtrar
    un socket colgado (`mail-connector.ts`; `MinimalImapClient.close()`). Tests: connect
    que nunca resuelve → `close()` llamado + retorna sin colgarse (`crm-tenant-mail-connector.test.ts`).
- [x] **T3.4 — Persistir en Engram.** Guardadas decisiones de Fase 2 (cadena de
  fallback de correo, precedente `KNOWN_PRESET_NAMES`, JSON-encoding del
  endpoint de test de un solo valor) vía `mem_save`/`mem_session_summary`.

## Follow-ups (fuera de este change)

- App interna Workspace por-tenant (habilitada por client_id/secret propios) —
  documentación + guía, no código.
- Lectura de correo POR EL AGENTE (invocar `readTenantInbox` desde el loop) — change
  aparte.
- Rotación de app-passwords / caducidad — deuda menor.
