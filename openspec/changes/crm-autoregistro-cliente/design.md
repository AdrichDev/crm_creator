# Design — Auto-registro de cliente + verificación de email

**Nivel Gru: 4.** Plano técnico. Alineado con `proposal.md`, `specs/autoregistro/spec.md`, `tasks.md`.

## 0. Estado real del repo (base del diseño)
- Auth back (`back/src/routes/auth.ts`): `register` (alta empresa+owner), `login`, `me`,
  `set-password`, `reset-password`, `forgot-password` (emite `password.reset_requested`), `change-password`.
- Modelo (`back/prisma/schema.prisma`): `User{email,passwordHash,firstName,lastName?,status,passwordChangedAt}`,
  `AuthToken{purpose:invite|reset, tokenHash, expiresAt, usedAt}`, `Membership{role:MemberRole}`,
  `MemberRole{OWNER,ADMIN,MANAGER,EMPLOYEE,RECEPTIONIST,PROFESSIONAL}`.
- Libs reusables: `lib/password.ts` (`validatePassword`, `generateAuthToken`, `hashToken`, `TOKEN_TTL_MS`),
  `lib/auth.ts` (`hashPassword`, `signToken`), `lib/rateLimit.ts`, `lib/automation` (`emit`).
- Emisor de eventos firmado HMAC operativo; n8n dispatcher `iJsa8iZjrjV20abQ` activo con ramas
  `user.invited` y `password.reset_requested` (verificadas e2e).
- Front (CRM generado): `demo-auth.ts` (localStorage), `app-shell.tsx` (gate con `isAuthed()`),
  `lib/api/client.ts` (`apiFetch`, token en `saas.token`, business en `saas.business.id`),
  `lib/api/account.ts` (set/reset/forgot/change), páginas `login/set-password/reset-password/forgot-password`.

## 1. Modelo de datos (migración aditiva)
```prisma
model User {
  // ...existente...
  username        String?   @unique   // handle del cliente; opcional para no romper filas existentes
  phone           String?
  emailVerifiedAt DateTime?
}
enum MemberRole { OWNER ADMIN MANAGER EMPLOYEE RECEPTIONIST PROFESSIONAL CLIENT }
enum AuthTokenPurpose { invite reset verify_email }
```
- `username` se declara opcional (`String?`) para que la migración no rompa usuarios existentes;
  la unicidad sigue garantizada (NULLs múltiples permitidos en Postgres).
- `lib/password.ts`: `TOKEN_TTL_MS.verify_email = 7 * 24 * 60 * 60 * 1000` (7 días, como invite).
- Migración: recipe `migrate diff` sin DROP de tablas externas (pgvector) + workaround EPERM
  `prisma generate` en Windows (memoria `crm-prisma-migration-gotcha`).

## 2. Endpoints back (`auth.ts`)
### 2.1 `POST /auth/register-client`
- Rate-limit nuevo `registerLimiter` (por IP, p.ej. 5/15min).
- `businessId` desde header `x-business-id` (multi-tenant); si falta → 400.
- Zod: `{ firstName: string, email: email→lowercase, username: string(3-30, [a-z0-9_]), phone: string }`.
- Si email o username ya existen → **respuesta neutra 200** (no se filtra; anti-enumeración).
- En `$transaction`: `User{status:'pending', firstName, email, username, phone, passwordHash: ''}`
  + `Membership{businessId, role:'CLIENT'}`. Genera token `verify_email` (TTL 7d).
- `emit('email.verification_requested', { userId, email, firstName, businessName?, verifyUrl, expiresAt, branding? }, { businessId })`.
- Respuesta SIEMPRE 200 neutra: `{ message: 'Si el email es válido, te enviaremos un enlace de verificación' }`.

### 2.2 `POST /auth/verify-email`
- Generaliza `consumeTokenAndSetPassword(plainToken, newPassword, { purpose })`:
  busca `AuthToken{tokenHash, purpose:'verify_email', usedAt:null, expiresAt>now}`;
  set `passwordHash`, `status:'active'`, `emailVerifiedAt:now`, `passwordChangedAt:now`;
  marca token usado + invalida otros tokens del usuario. Política password vía `validatePassword`.
- Reusa el schema/validación de `set-password` (token + newPassword + repeatPassword).

### 2.3 `login` (modificación)
- Tras verificar credenciales OK: si `user.status !== 'active'` → 403 `{code:'email_no_verificado'}`.
  Se mantiene el `bcrypt.compare` previo (dummy hash si no existe usuario) para no abrir oráculo de tiempo.

### 2.4 Evento (`lib/automation/events.ts`)
```ts
'email.verification_requested': {
  userId: string; email: string; firstName: string; businessName?: string;
  verifyUrl: string;   // /verify-email?token=...
  expiresAt: string;   // ISO
  branding?: EmailBranding;
};
```

## 3. n8n (dispatcher + plantilla)
- Switch: añadir rama `email.verification_requested` → nodo `Email: verificación`.
- Plantilla `n8n/templates/email-verification.html` (emoji ✅, branding, botón "Verificar email",
  usa `$json.logoHtml/primary/expiresHuman/data.verifyUrl`). El Code node ya calcula esos helpers.
- Despliegue: REST API `PUT /api/v1/workflows/{id}` + `/activate`. Test e2e firmado.

## 4. Front (reemplaza demo-auth)
- `lib/api/account.ts`: `registerClient({firstName,email,username,phone})`, `verifyEmail(token,newPassword,repeatPassword)`,
  `login(email,password)` → guarda `saas.token`, `saas.business.id`, y rol de membership.
- `app/login/page.tsx`: form real (quita `demoLogin/DEMO_*`) + enlace a `/registro`.
- `app/registro/page.tsx` (nuevo): form nombre/correo/user/teléfono → `registerClient` → pantalla "revisa tu email".
- `app/verify-email/page.tsx` (nuevo): token de la URL + UI fijar contraseña (reusa la de `set-password`).
- `app-shell.tsx`: gate con presencia de token real (no `isAuthed()` demo).
- `lib/tenant-config-context.tsx` (`useRole`): fija rol de vista desde el role de membership.
- Eliminar `lib/auth/demo-auth.ts` + referencias.

## 5. Seguridad (mapa)
| Riesgo | Mitigación |
|---|---|
| Enumeración de cuentas (registro) | Respuesta neutra 200 siempre |
| Contraseña en claro por email | No se envía; el cliente la fija al verificar |
| Token robado/reusado | Hash SHA-256 en BD, un solo uso, expira 7d, invalida hermanos |
| Fuerza bruta registro | rate-limit por IP |
| Cuenta sin email válido | login bloqueado hasta `emailVerifiedAt` |
| Escalada de privilegios cliente | `CLIENT` solo filtra vistas; RBAC back no le da escritura de admin |

## 6. Reúso (no reinventar)
`generateAuthToken`/`hashToken`/`TOKEN_TTL_MS`, `validatePassword`, `hashPassword`/`signToken`,
`rateLimit`, `consumeTokenAndSetPassword` (generalizar), `emit` + patrón de rama del dispatcher,
`apiFetch`, UI de `set-password`.
