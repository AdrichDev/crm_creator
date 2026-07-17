# Design — crm-central-oauth-admin-config

## §A. Cadena de resolución (el núcleo)

`resolveClientCreds(businessId)` (`providers/google.ts:70-95`, ya existe) pasa de
`tenant → env` a **`tenant → plataforma → env`**:

1. Secreto del tenant (`getTenantSecret(businessId, ...)`) — si ambos → usar (invariante
   IncompleteTenantOAuthError intacto).
2. **Config de plataforma** (nuevo) — si ambos en BD-plataforma → usar.
3. `process.env.GOOGLE_OAUTH_*` (legacy fallback) — retro-compat.

Mismo par-o-nada por nivel (nunca mezclar id de un nivel con secret de otro).

## §B. Store de plataforma

El builder elige el más limpio según el esquema real:
- **Opción A (preferida si el esquema lo admite)**: `TenantSecret` con un sentinel de
  plataforma (p.ej. `businessId = PLATFORM_SENTINEL`), reusando cifrado/CRUD.
- **Opción B**: tabla `PlatformSetting` mínima (`key` unique, `valueCiphertext`/`iv`/
  `authTag`), cifrada con `SECRETS_MASTER_KEY`. Migración aditiva.

Helper `getPlatformSecret(name, { fallbackEnv })` análogo a `getTenantSecret`.
Claves: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`.

## §C. API admin-plataforma

Ruta(s) gated por operator/plataforma (patrón `integrations.ts:212`, NUNCA membership
de tenant):
- `GET  /api/platform/oauth-config` → estado (configurado sí/no, sin devolver secret).
- `PUT  /api/platform/oauth-config` → upsert cifrado de las 3 claves.
- `POST /api/platform/oauth-config/test` → validación de formato (sin fuga del value),
  rate-limit.

## §D. Front admin-plataforma

Sección "Google OAuth (plataforma)" en la vista de admin-plataforma: 3 inputs
(client_id, client_secret, redirect_uri) + guardar + probar + nota "vacío = usa el
env de deploy (legacy)". Reusa el patrón de cards del panel de keys.

## §E. Retro-compat / no-export

- Sin config en BD → env → comportamiento idéntico al deploy actual.
- Las 3 claves de plataforma son server-side; jamás entran a ningún export (no son
  `FRONTEND_PUBLIC`, no tienen `envVarName`).

## §F. Test (node:test — CRM back)

- Resolución 3 ramas: tenant presente → tenant; solo plataforma → plataforma; nada →
  env; par incompleto por nivel → error.
- `getPlatformSecret` cifra/descifra; `reveal`/estado sin fugar secret.
- API admin: gate operator (401/403 sin token), upsert cifrado, test sin fuga.
- Regresión cero: sin config plataforma → env idéntico.
- No-export: las claves plataforma no aparecen en `buildEnvContent`.

Regla del repo: DONE solo con test verde.
