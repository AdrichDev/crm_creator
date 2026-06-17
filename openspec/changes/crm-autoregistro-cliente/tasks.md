# Tasks — crm-autoregistro-cliente   (Nivel 4 — IMPLEMENTADO Y VERIFICADO)

> Decisiones en `proposal.md`/`design.md`. Verificado e2e 2026-06-17.

## Fase A — BD (migración Prisma aditiva)
- [x] A.1 `schema.prisma`: `User += username String? @unique, phone String?, emailVerifiedAt DateTime?`.
- [x] A.2 `enum MemberRole += CLIENT`; `enum AuthTokenPurpose += verify_email`.
- [x] A.3 `lib/password.ts`: `TOKEN_TTL_MS.verify_email = 7d`.
- [x] A.4 Migración `20260617222303_add_client_autoregistro` (sin DROP de tablas externas) + `prisma generate` (workaround EPERM). Tablas externas verificadas intactas.

## Fase B — Back (endpoints + evento)
- [x] B.1 `events.ts`: `email.verification_requested` (verifyUrl + branding).
- [x] B.2 `auth.ts`: `POST /auth/register-client` (rate-limit, x-business-id, pending+CLIENT, token verify_email, emit, respuesta neutra).
- [x] B.3 `auth.ts`: `consumeTokenAndSetPassword` generalizado + `POST /auth/verify-email` (active + emailVerifiedAt + set pass).
- [x] B.4 `auth.ts`: `login` bloquea `status != active` → 403 `email_no_verificado`.

## Fase C — n8n (email de verificación)
- [x] C.1 `crm-automation-dispatcher.json`: rama `email.verification_requested` + nodo Email.
- [x] C.2 `n8n/templates/email-verification.html` (emoji ✅ + branding).
- [x] C.3 Desplegado (REST API) + activo. Email verificación enviado (ejecución `success`), tamper → 401.

## Fase D — Front (reemplaza demo-auth)
- [x] D.1 `lib/api/account.ts`: `registerClient`, `verifyEmail`; `lib/auth/session.ts`: `login` real + `isAuthed`/`logout` + mapeo de rol.
- [x] D.2 `app/login/page.tsx`: login real + enlace "Regístrate"/olvido. Sin demo.
- [x] D.3 `app/registro/page.tsx` (nuevo): form nombre/correo/user/teléfono.
- [x] D.4 `app/verify-email/page.tsx` (nuevo): token URL → fijar contraseña (AuthShell).
- [x] D.5 `app-shell.tsx`/`sidebar.tsx`/`(dashboard)/page.tsx`: gate + logout con `session`. `client.ts`: businessId con fallback `NEXT_PUBLIC_BUSINESS_ID`.
- [x] D.6 `lib/auth/demo-auth.ts` eliminado (sin referencias).

## Verificación
- [x] V.1 `tsc` limpio (back y front). Migración aplica, `prisma generate` ok.
- [x] V.2 Tests back (node:test): 6 nuevos (`auth-client-register.e2e`) — pending, login pre-verify→403, verify→active+login, unicidad email/username, 400 sin business, respuesta neutra. 43 existentes siguen verdes.
- [x] V.3 n8n e2e: email verificación entregado (`success`), firma inválida→401.
- [x] V.4 Front: `npm test` 67 verdes; demo-auth eliminado sin romper el gate.
- [x] V.5 Seguridad: token un solo uso/expira ✓, sin password en claro ✓, registro neutro ✓, 403 gating ✓. AUDITORÍA RBAC (`sec-review.md`): hallazgo CRÍTICO F1/F2 (crud/dashboard/bookings/packages sin guard → CLIENT leía/borraba toda la PII) → CERRADO con `staffOnly` (deny-by-default) + router `/me` scoped + test de regresión. Veredicto APTO-CON-FIXES. Pendiente no bloqueante: cablear front CLIENT a `/me/*`, matriz EMPLOYEE/ADMIN (F3).
