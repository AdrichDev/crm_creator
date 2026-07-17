# Security Review — crm-central-oauth-admin-config

Reviewer: automated sec-review (read-only). Date: 2026-07-17.
Scope: CENTRAL Google OAuth app secret stored in DB (`PlatformSetting` / `platform_setting`)
+ operator-gated admin API. Verified against REAL code, not `tasks.md` checkboxes.

## Verdict summary

| Check | Result |
|---|---|
| Encryption at rest (AES-256-GCM, `SECRETS_MASTER_KEY`) | PASS |
| Auth gate (operator token, not tenant-reachable) | PASS |
| No secret leak (status/test/logs) | PASS |
| No export | PASS |
| Resolution correctness (AC2/AC3, pair-or-nothing, guard) | PASS |
| Rate-limit on test endpoint | PASS |
| Targeted tests (4 files) | PASS — 28/28 |
| `npm run typecheck` | PASS — clean |

**SECURITY VERDICT: SAFE TO COMMIT + DEPLOY** (with the migration-ordering caveat below).
No secret-leak path found. No tenant-reachable admin write path found.

---

## AC-by-AC

### AC1 — Encryption at rest (AES-256-GCM) — PASS
- `PlatformSetting` model persists `valueCiphertext`/`iv`/`authTag`/`keyVersion`
  (`prisma/schema.prisma:1223-1234`; migration `20260716000000_platform_setting/migration.sql`).
- `upsertPlatformSecret` encrypts before write; `readPlatformSecret` decrypts on read
  (`platform-secrets/store.ts:110-121`, `:64-75`). No plaintext column exists.
- Crypto is the SAME proven AES-256-GCM as `TenantSecret`: `encryptSecret`/`decryptSecret`
  with `SECRETS_MASTER_KEY` (iv 12B, authTag 16B, hex), key-version aware
  (`tenant-secrets/crypto.ts:59-83`). Central `client_secret` never stored in plaintext.
- Migration enables RLS with NO policies → deny-by-default except Prisma service role
  (`migration.sql:29`), same posture as `tenant_secret`.

### AC2 — Resolution tenant -> platform -> env, pair-or-nothing — PASS
- `resolveCred` walks tenant -> platform -> env per credential
  (`providers/google.ts:75-94`); platform level only consulted when `platformDb` injected.
- Pair-or-nothing enforced by `sourceRank` comparison: if `clientId` and `clientSecret`
  resolve from DIFFERENT levels, throws `IncompleteTenantOAuthError`
  (`google.ts:130-134`). No id-from-one-level + secret-from-another mixing.
- `IncompleteTenantOAuthError` preserved and error message never echoes secret values
  (`google.ts:22-31`).
- Redirect URI resolves platform -> env analogously (`google.ts:161-163`).
- Tests: `crm-central-oauth-resolution.test.ts` — tenant wins; platform-only uses platform
  (not env); cross-level pairs both directions -> error; null businessId -> platform -> env;
  redirect platform/env. All green.

### AC3 — Regression zero (no DB config -> identical to env) — PASS
- No platform row -> `getPlatformSecret`/`readPlatformSecret` return null -> falls to
  `process.env.GOOGLE_OAUTH_*` (`store.ts:94-102`, `google.ts:90-91`).
- Guard: if the `platformSetting` delegate is absent (client not yet regenerated),
  `readPlatformSecret`/`platformSecretStatus` degrade to `null`/empty instead of throwing
  (`store.ts:68`, `:134`) -> hot-path falls to env, no crash.
- Note: legacy env secret name is `GOOGLE_OAUTH_SECRET` (not `_CLIENT_SECRET`), correctly
  mapped in `resolveCred` call-sites (`google.ts:117,125`) and covered by tests.
- Tests: resolution + no-export files assert env-identical output when platformDb empty or
  not injected. Green.

### AC4 — Auth gate + no-leak on write/status/test + rate-limit — PASS
- Mounted under `serviceOperatorRouter` which applies `requireOperatorToken()` to the WHOLE
  router BEFORE the platform-oauth sub-router (`service-operator.ts:566`, `:763`).
  Router is mounted at `/service/operator` (`server.ts:38`), OUTSIDE `/api` — it never passes
  through the tenant JWT/membership gate. A tenant admin has no `x-service-token`, so cannot
  reach it.
- `requireOperatorToken` is fail-closed (empty env -> 401), constant-time compare
  (`middleware/operator-token.ts:24-34`).
- GET status returns only `configured`/`updatedAt` metadata, never the value
  (`platform-oauth.ts:64-80`, `platformSecretStatus` selects only `key`+`updatedAt`,
  `store.ts:128-138`).
- PUT encrypts and returns only status, never the value (cipher or plaintext)
  (`platform-oauth.ts:108-121`). Rejects non-string/CRLF-injection input (`:92-99`).
- POST-test validates FORMAT only; the tested `value` is never interpolated into `detail`
  (`platform-oauth.ts:146-148`; `testRedirectUri` `:47-60`; provider 'google' branch is local
  format-only, `provider-test.ts:194-200`).
- Test gate faithfully mirrors production: `platform-oauth.route.test.ts:66-69` mounts
  `requireOperatorToken(TOKEN)` then `buildPlatformOAuthRouter` — asserts 401 (no/wrong token)
  AND nothing written. Green.

### AC5 — No export — PASS
- The 3 platform keys are server-side: no `envVarName`, not `FRONTEND_PUBLIC`.
- Export env writers emit only `PLATFORM_API_URL`/`TENANT_ID`/`TENANT_API_KEY`/
  `NEXT_PUBLIC_BUSINESS_ID` (`export-builders/runtime-config-env.ts:27-52`) — never any
  `GOOGLE_OAUTH_*`.
- Test `crm-central-oauth-no-export.test.ts` asserts `buildEnvContent` output contains none of
  the 3 keys AND `buildEnvContent.toString()` does not even reference them. Green.

### AC6 — Front admin (secondary; back is in scope) — NOT RE-VERIFIED
- Front proxy routes are operator-gated per `tasks.md` T4; visual verification is HITL-pending.
  Out of scope for this back-focused secret review; no back-side risk.

---

## No-leak sweep (grep evidence)
- `platform-secrets/store.ts`: zero `console.*` calls — decrypted value never logged.
- `platform-oauth.ts`: `console.error` only logs the caught error object with a static prefix
  (`:77,123,157`), never the credential value.
- `providers/google.ts`: comments explicitly state the secret lives only in request memory and
  is never logged/echoed; no logging of `clientSecret`/`clientId` present.
- The service token itself is never logged (`operator-token.ts`).

---

## Migration-ordering caveat (deploy gate)
The migration `20260716000000_platform_setting` is NOT yet deployed. Required order at deploy:
1. `prisma migrate deploy` (creates `crm.platform_setting`), then
2. `prisma generate` (registers the `platformSetting` delegate), then
3. deploy the code.

The `readPlatformSecret`/`platformSecretStatus` delegate guards (`store.ts:68`, `:134`) make
the code regression-safe if it ships before the delegate exists (degrades to env), but the
admin PUT/GET will not function until steps 1-2 are complete. No security impact from ordering;
worst case pre-migration is env-only behavior (current production behavior).

## Minor doc note (not a finding)
`design.md` §C / `validation.md` reference the path as `/api/platform/oauth-config`. Actual
back mount is `/service/operator/platform/oauth-config` (the operator carril, deliberately
outside `/api`). The front proxies the `/api/...` path. This is MORE restrictive than the doc
implies, not less. No action required.

## Test evidence
- `npx tsx --test` on the 4 files: **28 pass / 0 fail** (store 9, resolution 9, no-export ~2,
  route 8 subtrees).
- `npm run typecheck`: clean, no errors.
