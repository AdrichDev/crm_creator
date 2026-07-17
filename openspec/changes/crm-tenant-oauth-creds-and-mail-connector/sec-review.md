# Security Review — crm-tenant-oauth-creds-and-mail-connector

Reviewer: security minion (read-only; verified against real code, not tasks.md checkboxes).
Date: 2026-07-17. Scope: Fase 1 (Google OAuth per-tenant) + Fase 2 (IMAP/SMTP connector).

## SECURITY VERDICT

**PASS — safe to commit.** No secret-leak path found. `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_CLIENT_ID` and the 6 `MAIL_*` slots are stored `BACKEND_SECRET` with no
`envVarName`, encrypted AES-256-GCM, and are structurally excluded from every export
artifact at the DB-query level. No secret value is logged, interpolated into a URL, or
returned in a `test`/`reveal` response body (other than the pre-existing, admin-gated
`reveal` endpoint, which is by explicit product design — see WARNING-1).

Tests: `crm-tenant-oauth-creds` + `crm-tenant-mail-connector` + `notify` +
`export-manifest-cruft` + `export-manifest-snapshot` = **63 pass / 0 fail**.
`tsc --noEmit` (back) = **0 errors**.

## Per-AC security results

| AC | Result | Evidence |
|----|--------|----------|
| AC1 (catalog: BACKEND_SECRET, no envVarName, encrypted) | PASS | `catalog.ts:79-80` both Google slots `scope:'BACKEND_SECRET'`, no `envVarName`, `group:'google'`. |
| AC2 (no tenant+central mix) | PASS | `google.ts:70-95` `resolveClientCreds`: both creds read via `getTenantSecret`; if `idFromTenant !== secretFromTenant` → `IncompleteTenantOAuthError` (`:90-91`). Central only when BOTH resolve from operator. No `businessId` → always central (`:75-80`). |
| AC3 (regression: no creds → central) | PASS | `google.ts:82-83` `fallbackEnv` GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_SECRET; both absent-from-tenant → `source:'operator'`, equal → central path. `notify.test.ts` "dep ausente → SMTP central" + oauth regression green. |
| AC5 (no export leak — Google) | PASS | Export `extraLines` fed ONLY by `readBakeableSecrets` (`exports.ts:45,164`), whose Prisma WHERE is `scope:'FRONTEND_PUBLIC', envVarName:{not:null}` (`store.ts:159-161`). BACKEND_SECRET/no-envVarName rows never enter memory. `buildEnvContent` (`manifest-allowlist.ts:229-260`) emits only TENANT_JSON/API_URL/Supabase-public + extraLines. Grep of export path: no `GOOGLE_OAUTH_*`. |
| AC6 (test creds w/o revealing secret) | PASS | `provider-test.ts:194-200` case `'google'`: local FORMAT regex only, no network, value never in `detail`. |
| AC7 (6 mail slots, BACKEND_SECRET, encrypted, port defaults) | PASS | `catalog.ts:87-92` 6 slots BACKEND_SECRET/no envVarName/group 'mail'. Defaults `mail-connector.ts:20-21` (IMAP 993, SMTP 465). |
| AC8 (tenant SMTP before central; no MAIL_* → central) | PASS | `mail-connector.ts:146-162` `sendViaTenantSmtp` uses tenant creds; `notify.ts` chain Gmail→tenant SMTP→central, `MailNotConfiguredError` = silent fallback sentinel. `notify.test.ts` 5/5 green. |
| AC9 (IMAP hard timeout, best-effort, TLS) | PASS | `mail-connector.ts:184-236` every net op (`connect`/`getMailboxLock`/`fetch` loop/`logout`) wrapped in `withTimeout`; `secure:true` (`:199`); `lock.release()` in finally; `logout` best-effort with `.catch()`. Never hangs. |
| AC10 (test IMAP+SMTP, rate-limit 5/min, timeout, no leak) | PASS | `provider-test.ts:201-216` case `'mail'` delegates to `testMailConnection` (own internal hard timeouts, `mail-connector.ts:258-304`); value never in `detail`. Route rate-limit `tenant-keys.ts:255-282` = 5 / 60_000ms, applied AFTER admin gate. |
| AC11 (MAIL_APP_PASSWORD + CLIENT_SECRET AES-256-GCM, never logs/export, reveal admin) | PASS | Encrypted via `crypto.ts` (`encryptSecret`, AES-256-GCM, 12B IV, 16B tag). Never logged (see below). Never exported (AC5 mechanism). `reveal` admin-gated (`tenant-keys.ts:313-315` → `requireMemberAdmin` ADMIN/MANAGER). |

## No-secret-in-logs audit (new/changed files)

- `providers/google.ts`: no `console.*`. `client_secret` only placed in the token-exchange
  request body (`oauth.ts:222,334`) sent to Google over TLS — never logged.
- `oauth.ts`: `console.error` at `:235,250` log only service name + HTTP status +
  `Error.message` (no token, no secret). Token-exchange bodies not logged.
- `mail-connector.ts`: `withTimeout` rejects with `label` only (`:135`); `detail` strings
  are generic (`:278,281,297,300`); ImapFlow constructed with `logger:false` (`:128`).
  `appPassword` never interpolated into any string.
- `provider-test.ts`: `value` never interpolated into `detail` in any branch; catch-all
  returns a generic string (`:220`).
- `notify.ts`: warnings log `businessId` + `Error.name` only (`:82,112`), never the message body/password.

## WARNINGS (non-blocking)

- **WARNING-1 (inherited, product-approved):** `GET /:businessId/secrets/:name/reveal`
  (`tenant-keys.ts:313-326`) returns the decrypted plaintext value in the response body
  for ANY catalog secret — now including `GOOGLE_OAUTH_CLIENT_SECRET` and
  `MAIL_APP_PASSWORD`. This is pre-existing behavior of the reused tenant-keys subsystem,
  gated to ADMIN/MANAGER of the path `:businessId` (cross-tenant closed via Membership,
  non-member → 404). "Insecure by design, at explicit product request" per the code
  comment. It is NOT introduced by this change, but the two new high-value secret classes
  now flow through it. Acceptable given the gate; flagged for awareness. No rate-limit on
  `reveal` (unlike `test`).
- **WARNING-2 (minor):** `withTimeout` (`mail-connector.ts:132-138`) rejects on timeout but
  does not force-close the underlying imapflow socket on a `connect` timeout; the outer
  `finally` logout mitigates. Best-effort contract is met (function never hangs); lingering
  socket is GC/keepalive-bounded. No security impact.

## CRITICAL

None.

## Conclusion

All 11 ACs hold against real code. Encryption-at-rest, no-export-leak, no-log-leak,
no-tenant/central-mix, IMAP timeout safety, and rate-limited/format-only provider tests
are all verified. Safe to commit. Recommend keeping WARNING-1 in mind if `reveal` is ever
exposed beyond the current admin gate (consider rate-limiting or omitting it for the two
new secret classes in a follow-up).
