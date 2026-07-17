# Proposal — crm-central-oauth-admin-config

## Intent

Quitar la dependencia de env de Render para las credenciales de la **app Google
central** (la compartida por defecto). Hoy `googleOAuthConfig` (`providers/
google.ts:53-55`) lee `process.env.GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI`
como fallback central; se hace que esas creds centrales se configuren desde un
**panel de admin-plataforma** (guardadas cifradas en BD), con el env como
último recurso retro-compatible.

Resultado de la cadena de resolución (por `businessId`):
**secreto del tenant → config admin-plataforma (BD) → env (legacy)**.

Así: creds per-tenant en el panel del tenant (ya hecho, Fase anterior) + creds
centrales en el panel de admin-plataforma → **cero Render** para OAuth.

## Problema

`googleOAuthConfig` resuelve el fallback central SOLO desde `process.env`
(`google.ts:53-55`). No hay forma de configurar la app central por UI; obliga a
tocar env de Render en cada cambio. El store de secretos por-tenant existe pero es
per-`businessId`; falta un **nivel plataforma** (businessId nulo/sentinel) + un
panel de admin.

## Scope

- **Store plataforma**: guardar `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `GOOGLE_OAUTH_REDIRECT_URI` a nivel plataforma. Reusar el store cifrado
  (`TenantSecret` con un `businessId` sentinel de plataforma **si el esquema lo
  admite**, o un `PlatformSetting`/`SystemConfig` pequeño — el builder elige el más
  limpio del esquema real). AES-256-GCM, mismo patrón.
- **Resolución** en `google.ts`/`oauth.ts`: intercalar la config de plataforma entre
  el secreto del tenant y el env: tenant → plataforma → env. Sin romper nada.
- **API admin-plataforma**: endpoint(s) para leer/escribir/probar las creds
  centrales, gated por **operator service token / admin plataforma** (patrón
  `integrations.ts:212` `/admin/...`), NUNCA por membership de tenant.
- **Front admin-plataforma**: sección "Google OAuth (plataforma)" para meter las 3
  creds + probar. Reusa el patrón del panel de keys.
- **Retro-compat**: si no hay config en BD, cae al env (deploy actual sigue vivo).
- **NO export**: las creds centrales son de plataforma, jamás salen a ningún export.

## Risks

- **Secreto central de alto valor** en BD. Cifrado AES-256-GCM, nunca en logs,
  nunca al export, gated admin-plataforma. `reveal` con rate-limit (ya añadido).
- **Cambio en el hot-path de OAuth**. Regresión cero: sin config en BD → env
  idéntico al de hoy. Tests de las 3 ramas (tenant/plataforma/env).
- **Aislamiento del gate**: el endpoint admin NO debe ser alcanzable por un admin de
  tenant — solo operator/plataforma.

## Dependencies

- `providers/google.ts` (`googleOAuthConfig`), `integrations/oauth.ts` (3 call-sites,
  ya reciben `businessId`), store de secretos (`tenant-secrets/{store,crypto}.ts`),
  ruta admin (`routes/integrations.ts:212` patrón operator-token), front panel.
- Change previo SHIPPED: `crm-tenant-oauth-creds-and-mail-connector` (resolución
  tenant→env ya existe; esto inserta el nivel plataforma en medio).
