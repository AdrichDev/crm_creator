# Tasks — crm-central-oauth-admin-config

Tests con **node:test** (CRM back). DONE solo con test verde.

- [x] **T1 — Store de plataforma.** `getPlatformSecret(name, { fallbackEnv })` +
  persistencia cifrada. **Opción B elegida**: tabla `PlatformSetting` mínima
  (`clave` unique + `valor_cifrado`/`iv`/`auth_tag`/`clave_version`) + migración
  aditiva. Motivo: `TenantSecret.negocio_id` es FK NOT NULL con onDelete Cascade;
  un businessId centinela (Opción A) exigiría una fila Business falsa o soltar la
  FK — ambas sucias. Cifrado AES-256-GCM con `SECRETS_MASTER_KEY` (mismo
  `tenant-secrets/crypto.ts`).
  - Ficheros: `back/src/lib/platform-secrets/store.ts`,
    `back/prisma/schema.prisma` (model `PlatformSetting`),
    `back/prisma/migrations/20260716000000_platform_setting/migration.sql` (NO desplegada).
  - Test: `back/src/lib/platform-secrets/__tests__/platform-secrets.store.test.ts`
    (cifra/descifra; ausente → fallbackEnv; presente → valor plataforma; guard
    delegate ausente → null; status sin valor). **7/7 verde.**
- [x] **T2 — Resolución tenant→plataforma→env.** Nivel plataforma intercalado en
  `resolveClientCreds` (`providers/google.ts`), par-o-nada por nivel (rank
  tenant>plataforma>env). Redirect URI también plataforma→env. `platformDb`
  inyectable; sin inyectar → nivel plataforma omitido (regresión).
  - Ficheros: `back/src/lib/integrations/providers/google.ts`,
    `back/src/lib/integrations/oauth.ts` (OAuthDeps.platformDb + 5 call-sites + defaultDeps).
  - Test: `back/src/lib/__tests__/crm-central-oauth-resolution.test.ts`
    (3 ramas + incompleto por nivel → `IncompleteTenantOAuthError` + regresión sin
    plataforma → env idéntico + redirect plataforma/env). **10/10 verde.**
- [x] **T3 — API admin-plataforma.** `GET/PUT/POST-test /platform/oauth-config`
  bajo `serviceOperatorRouter` (`/service/operator`, gate `requireOperatorToken`);
  upsert cifrado; estado sin secret; test sin fuga del value; rate-limit (`consume`).
  - Ficheros: `back/src/routes/platform-oauth.ts`,
    `back/src/routes/service-operator.ts` (mount).
  - Test: `back/src/routes/__tests__/platform-oauth.route.test.ts`
    (sin/mal token → 401 y nada escrito; PUT cifra sin devolver value; GET estado
    sin secret; test ok/ko sin fuga; rate-limit → 429). **11/11 verde.**
- [x] **T4 — Front admin-plataforma.** Sección "Google OAuth (plataforma)" (3 inputs
  + guardar + probar + nota "vacío = usa el env de deploy (legacy)").
  - Ficheros: `front/components/config/platform-oauth-panel.tsx`,
    `front/lib/api/platform-oauth.ts`,
    `front/app/api/platform/oauth-config/route.ts` (GET/PUT proxy operator-gated),
    `front/app/api/platform/oauth-config/test/route.ts` (POST proxy),
    `front/app/(operador)/plataforma/page.tsx`.
  - Test: `front npx tsc --noEmit` **verde**. Verificación visual: PENDIENTE (HITL).
- [x] **T5 — No-export + regresión.** Las 3 claves plataforma NO aparecen en
  `buildEnvContent`/export (server-side, sin envVarName/FRONTEND_PUBLIC); sin config
  BD → env idéntico al deploy actual.
  - Test: `back/src/lib/__tests__/crm-central-oauth-no-export.test.ts`
    (buildEnvContent sin `GOOGLE_OAUTH_*` + assert de que no referencia las claves +
    regresión env). **verde.**

## Verificaciones finales

- [x] **T6 — Typecheck + suite** (`back` node:test + tsc, `front` tsc) verde.
  - `back npm run typecheck`: verde. `back npm test`: **980 pass / 0 fail** (256 suites).
  - `front npx tsc --noEmit`: verde.
- [x] **T7 — sec-review** (2026-07-17): VERDICT **SAFE TO COMMIT + DEPLOY**. 6 AC PASS, 28/28 tests, tsc 0. Sin leak; admin gated operator-token en `/service/operator` (fuera de `/api`, tenant no alcanza); PlatformSetting AES-256-GCM + RLS deny-by-default; no-export; resolución tenant→plataforma→env pair-or-nothing; guard degrada a env sin migración. Report en `sec-review.md`. Caveat: orden migrate deploy+generate antes del código (guard lo hace regresión-safe).
- [x] **T8 — Barrido de código muerto** (2026-07-17): removido lo probadamente muerto (`__dirname_`+`fileURLToPath` en apk/exe/ipa/web-zip.ts; type alias `EntryData` en storage-exports; imports/params sin uso en front). Fallback env INTACTO. tokensave dio 829 falsos positivos (gap grafo) → tsc-strict+grep. Suite 980/0 post-barrido. Original T8:
  buscar y eliminar código muerto / no usado relacionado con OAuth/env
  (p.ej. lecturas de `process.env.GOOGLE_OAUTH_*` que queden huérfanas, imports sin
  uso, ramas inalcanzables). Usar `tokensave_dead_code`/`unused_imports` + verificación
  manual. NO borrar el fallback env (es retro-compat intencional).
  - Test: suite verde tras el barrido (nada roto).
- [x] **T9 — Engram.** Persistido (#953 en curso + cierre al mergear).

## Follow-ups
- Migrar el resto de creds de plataforma (SMTP central, etc.) al mismo panel admin —
  aparte.
- HITL despliegue: `prisma migrate deploy` (aplica `20260716000000_platform_setting`)
  + `prisma generate` (registra el delegate `platformSetting`) ANTES de desplegar el
  código — el orden importa para la regresión cero.
