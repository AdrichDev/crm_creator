# Design — Gestión de usuarios y autenticación

**Nivel Gru: 4 — Crítica.** Solo diseño. Requiere aprobación humana antes de implementar (Fase 2).
Alineado con `proposal.md`, `specs/usuarios/spec.md` y `tasks.md`. Integra con `crm-n8n-automations` para email.

Principios:
- Portable a Supabase Auth (futuro). Nada acopla credenciales a infra propia más allá de bcrypt + JWT ya existentes.
- Migraciones **aditivas**. No tocar `crm_project`/`tenants_registry` (viven fuera de Prisma).
- Multi-tenant: todo opera sobre `businessId` del token, igual que `crud.ts` y `authenticate`.
- Nunca exponer `passwordHash` ni el token de reset por API de lectura.

---

## 1. Modelo de datos

### 1.1 Nueva tabla `PasswordResetToken`

```prisma
model PasswordResetToken {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String   // SHA-256 hex del token en claro (NUNCA se guarda el token en claro)
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([tokenHash])
}
```

En `model User` añadir el lado inverso de la relación (aditivo, no rompe nada):

```prisma
  resetTokens  PasswordResetToken[]
```

Decisiones de modelado:
- `tokenHash` indexado: el lookup en reset es por hash, no por id (el id nunca viaja).
- `usedAt` nullable marca consumo (un solo uso). Token válido = `usedAt IS NULL AND expiresAt > now()`.
- No se reutiliza la tabla `Notification` para esto: separa credenciales (sensible) de notificaciones.

### 1.2 SQL aditivo esbozado

```sql
CREATE TABLE "PasswordResetToken" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasswordResetToken_userId_idx"    ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");
ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> **Gotcha de migración**: `prisma migrate diff` intentará DROPear `crm_project`/`tenants_registry`.
> El SQL generado debe revisarse a mano y eliminar cualquier `DROP TABLE`/`DROP` de esas dos antes de aplicar.
> La migración real solo debe contener el `CREATE TABLE` + índices + FK de arriba.

No se añaden campos a `User`/`Membership`: ya tienen `passwordHash`, `status`, `role`. Suficiente.

---

## 2. Endpoints

Convenciones existentes a respetar:
- Validación con `zod` + `safeParse`; error de validación → **422** con `{ error: { code: 'validation', ... } }`.
- Formato de error uniforme `{ error: { code, message, details? } }`.
- RBAC vía `requireRole(...)` de `middleware/rbac.ts`. Admin = `OWNER` + `ADMIN`.
- Rutas autenticadas se montan tras `api.use(authenticate)`. Las de reset/forgot van **antes** (públicas, junto a `/auth`).

### 2.1 Gestión de usuarios — `/users` (admin del negocio activo)

Montaje: NO usar `crudRouter` genérico (filtra por `businessId` directo y no controla creación de credenciales ni RBAC). Router propio `usersRouter`, montado tras `authenticate`, con `requireRole('OWNER','ADMIN')` a nivel de router.

El "negocio" de un usuario se resuelve por su `Membership` con `businessId === req.businessId`. Listado/edición operan sobre usuarios que tienen membership en el tenant activo.

#### `GET /users`
- RBAC: admin.
- Respuesta **200**: `[{ id, email, firstName, lastName, status, role, createdAt }]`.
  - `role` = el `Membership.role` en el negocio activo.
  - **Nunca** `passwordHash`. Se hace `select` explícito, no `findMany` crudo.

#### `POST /users`
- RBAC: admin.
- Payload zod:
  ```ts
  z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().optional(),
    role: z.enum(['ADMIN', 'EMPLOYEE']),   // solo estos dos desde UI (AC-1)
  })
  ```
- Lógica (transacción):
  1. Si `User` con ese email existe → **409** `{ code: 'email_taken' }` (AC-1.1, sin filtrar más datos).
  2. `generatePassword()` → contraseña en claro ≥ 12 chars (AC-1.2).
  3. `hashPassword(plain)` (bcrypt cost 10, igual que hoy).
  4. Crear `User` + `Membership(businessId activo, role)`.
  5. Emitir evento email `user.created` a n8n con la contraseña en claro (§4). El claro **no se persiste**.
- Respuesta **201**: `{ id, email, firstName, role, emailSent: boolean }`.
  - `emailSent=false` si el webhook a n8n falla → el usuario queda creado, la UI ofrece "reenviar" (AC-1.3).
  - La contraseña en claro **no** se devuelve en la respuesta (solo viaja por email).

#### `PATCH /users/:id`
- RBAC: admin.
- Payload zod (parcial): `{ role?: z.enum(['ADMIN','EMPLOYEE']), status?: z.enum(['active','disabled']) }`.
- Solo afecta a usuarios con membership en el negocio activo (verificación previa → **404** si no).
- Guardas:
  - No permitir que un admin se quite a sí mismo el último rol admin del negocio (evita lock-out): si la edición dejaría 0 admins/owners → **409** `{ code: 'last_admin' }`.
  - No degradar/editar a un `OWNER` desde este endpoint (el owner es el creador del negocio) → **403**.
- Respuesta **200**: usuario actualizado (sin `passwordHash`).

#### `DELETE /users/:id`
- RBAC: admin.
- No permitir borrarse a sí mismo ni borrar al `OWNER` → **403**.
- Borra el `Membership` del negocio activo. Si el usuario no tiene más memberships → borra el `User` (cascade limpia tokens). Si tiene otras → solo quita el membership.
- Respuesta **204**.

### 2.2 Cambio de contraseña (logueado) — `POST /auth/change-password`
- Montaje: **tras** `authenticate` (necesita `req.userId`). Cualquier rol autenticado.
- Payload zod:
  ```ts
  z.object({
    oldPassword: z.string(),
    newPassword: z.string(),     // validada por passwordPolicy (§3)
    repeatPassword: z.string(),
  }).refine(d => d.newPassword === d.repeatPassword, ...)  // AC-2.2
  ```
- Lógica:
  1. Cargar `User` por `req.userId`. `verifyPassword(oldPassword, hash)` → si falla **401** `{ code: 'bad_credentials' }` (AC-2.1).
  2. `newPassword !== repeatPassword` → **422** (cliente y servidor).
  3. `passwordPolicy.validate(newPassword)` falla, o `newPassword === oldPassword` → **422** `{ code: 'weak_password' | 'same_password' }` (AC-2.3).
  4. `hashPassword(newPassword)` → `update`.
  5. (Opcional, recomendado) invalidar tokens de reset abiertos del usuario.
- Respuesta **204**.

### 2.3 Olvidé mi contraseña — `POST /auth/forgot-password`
- Montaje: **público** (antes de `authenticate`), junto a `/auth/register|login`.
- Payload zod: `{ email: z.string().email() }`.
- Lógica:
  1. Buscar `User` por email.
  2. Si existe: generar token en claro (32 bytes aleatorios → base64url), guardar `PasswordResetToken{ tokenHash: sha256(token), expiresAt: now()+TTL }`, emitir evento `password.reset_requested` a n8n con enlace `{FRONT_URL}/reset?token=...` (§4).
  3. **Siempre** responder **200** con mensaje neutro `"Si el email existe, enviaremos instrucciones"` — independientemente de si existía (AC-3.1). Mismo tiempo de respuesta aprox. (no ramificar de forma observable; el envío a n8n es async/fire-and-forget).
- Rate limiting por IP/email recomendado (mitiga enumeración por timing y spam) — ver §5.

### 2.4 Restablecer — `POST /auth/reset-password`
- Montaje: **público**.
- Payload zod: `{ token: z.string(), newPassword: z.string(), repeatPassword: z.string() }`.
- Lógica:
  1. `sha256(token)` → buscar `PasswordResetToken` por `tokenHash`.
  2. Inválido / `usedAt != null` / `expiresAt <= now()` → **400** `{ code: 'invalid_token' }` (genérico, no distingue causa).
  3. `newPassword !== repeatPassword` o falla `passwordPolicy` → **422**.
  4. Transacción: `hashPassword` + `update User`; marcar este token `usedAt=now()`; invalidar (marcar usados o borrar) **todos** los demás tokens del usuario (AC-3.3).
- Respuesta **204**. No auto-loguea (el usuario va a login). Decisión humana si se quiere devolver JWT (§6).

---

## 3. Seguridad

### 3.1 Generación de contraseña — `generatePassword()`
- `crypto.randomBytes` + alfabeto sin caracteres ambiguos (sin `0/O/l/1/I`), ≥ 12 chars, con al menos 1 de cada clase (mayús/minús/dígito/símbolo). Sesgo de módulo evitado (rechazo o `crypto.randomInt`).
- Nunca se loguea ni se persiste en claro. Solo entra al payload del evento n8n.

### 3.2 Política de contraseña — `passwordPolicy`
- Util compartido back (y espejo de reglas en front para feedback). Mínimo configurable.
- Default propuesto (sujeto a aprobación humana, §6): ≥ 8 chars, no igual a la antigua. (El spec AC-2.3 marca ≥ 8 configurable.)

### 3.3 Hashing
- `bcrypt` cost 10 (consistente con `lib/auth.ts` actual). No cambiar el coste aquí para no introducir inconsistencias; si se sube, subirlo en un change propio.

### 3.4 Tokens de reset
- Token en claro: 32 bytes random → base64url (~43 chars). Solo viaja en el enlace del email.
- En BD solo `sha256(token)` (no bcrypt: el token ya es alta entropía, sha256 es suficiente y rápido para lookup indexado).
- Un solo uso (`usedAt`), expiración (`expiresAt`, TTL propuesto 30 min — §6). Al usar uno, se invalidan los demás del usuario.

### 3.5 No fuga de datos
- `passwordHash` jamás en respuestas: usar `select` explícito en todas las lecturas de `User`.
- `forgot-password` respuesta neutra (no revela existencia del email).
- `reset-password` error genérico `invalid_token` (no distingue expirado/usado/inexistente).
- `/users` y `change-password` con RBAC server-side; la ocultación en UI es defensa en profundidad, no la única.

### 3.6 Mapeo `MemberRole` → rol front
Tabla canónica (AC-4.1). Implementar como helper compartido (back devuelve `MemberRole`, front mapea):

| MemberRole (back)                          | Rol front  |
|--------------------------------------------|------------|
| `OWNER`, `ADMIN`                           | `admin`    |
| `MANAGER`, `EMPLOYEE`, `RECEPTIONIST`, `PROFESSIONAL`, `ACCOUNTANT` | `trabajador` |

- `cliente` (rol front) no tiene `MemberRole`: es un perfil de portal/externo, fuera de este change.
- El `/auth/me` ya devuelve `role` (MemberRole); el front aplica el mapeo. `DEMO_USERS` se sustituye progresivamente por la sesión real (tasks 3.5), sin romper `useRole` mientras tanto.

---

## 4. Integración n8n (email)

Patrón de `crm-n8n-automations`: backend emite evento → `POST` webhook n8n firmado. n8n elige plantilla/canal.

- **Cliente de eventos** (nuevo util back, p.ej. `lib/automation.ts`): `emitEvent(type, payload)`:
  - `POST {N8N_WEBHOOK_URL}` con cuerpo `{ eventId, type, businessId, data }`.
  - Cabecera de firma `X-Signature: hmac-sha256(AUTOMATION_WEBHOOK_SECRET, rawBody)` para que n8n verifique origen.
  - `eventId` (cuid) para idempotencia en n8n (no duplicar envíos).
  - **Fallo suave**: si n8n no responde / timeout corto, no se aborta la operación CRM. Devuelve `false` (caller decide; en `POST /users` → `emailSent:false`).
- Eventos de este change:
  - `user.created` → `data: { email, firstName, plainPassword, businessName }`. (PII + credencial: canal n8n debe ser seguro; ver §5.)
  - `password.reset_requested` → `data: { email, firstName, resetUrl }`.
- Variables de entorno nuevas (en `env.ts`, con defaults vacíos): `N8N_WEBHOOK_URL`, `AUTOMATION_WEBHOOK_SECRET`, `FRONT_URL` (para construir `resetUrl`).
- Si n8n no está configurado (`N8N_WEBHOOK_URL` vacío): `emitEvent` no-op → `emailSent:false`. El flujo de creación sigue funcionando en dev.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Enumeración de usuarios (forgot) | Respuesta neutra + rate limit + envío async para no ramificar timing. |
| Credencial en claro viaja por email | Solo por canal n8n; recomendación de forzar cambio en primer login (mejora futura). Plain nunca en logs ni en respuesta HTTP. |
| Fuga de `passwordHash` | `select` explícito en todas las lecturas de `User`; test de regresión que falla si aparece en cualquier respuesta. |
| Migración DROPea tablas externas | Revisión manual del SQL; solo `CREATE TABLE PasswordResetToken` + índices + FK. |
| Lock-out de admin (auto-degradación/borrado) | Guardas `last_admin`, no editar/borrar `OWNER`, no borrarse a sí mismo. |
| Reuso/fuerza bruta de token reset | Hash en BD, un solo uso, TTL corto, invalidación cruzada, rate limit en reset. |
| n8n caído bloquea CRM | Fallo suave, idempotencia por `eventId`, `emailSent:false` + reenvío manual. |
| Secreto del webhook expuesto | `AUTOMATION_WEBHOOK_SECRET` en env, firma HMAC verificada por n8n, no en repo. |
| JWT actual sin revocación (30d) | Fuera de alcance; anotar como deuda. Cambio de contraseña no invalida JWTs vigentes (limitación conocida). |

---

## 6. Plan de implementación por fases (alineado con tasks.md)

- **Fase 1 — Diseño y aprobación** (este doc). Bloquea hasta decisiones humanas de abajo.
- **Fase 2 — Backend**: 2.1 migración → 2.8 `generatePassword`/`passwordPolicy` → 2.2-2.4 `/users` → 2.5 change-password → 2.6/2.7 forgot/reset → `lib/automation.ts` + env. Un builder por unidad funcional.
- **Fase 3 — Frontend**: tab Usuarios, modal nuevo usuario, cambiar contraseña, páginas forgot/reset, mapeo de rol y sustitución progresiva de `DEMO_USERS`.
- **Fase 4 — Seguridad y tests**: suite de tests (hashing, no-fuga, RBAC, token un-solo-uso/expiración, respuesta neutra) + revisión `cybersec:blueteam-*`.
- **Verificación**: `npm test` verde, `tsc` limpio, `next build` OK, e2e admin→trabajador→login→change→reset.

### PUNTOS QUE REQUIEREN DECISIÓN / APROBACIÓN HUMANA (Fase 1, bloqueantes)

1. **Política de contraseña** (`passwordPolicy` default). Propuesta: ≥ 8 chars, distinta de la antigua. ¿Subir a 12? ¿Exigir clases de caracteres en la del usuario (no solo en la generada)?
2. **TTL del token de reset**. Propuesta: 30 min. Confirmar.
3. **Longitud/forma de la contraseña generada**. Propuesta: 14 chars, 4 clases. Confirmar el mínimo 12 del spec.
4. **Canal y plantillas de email en n8n**, y manejo de PII/credencial en tránsito (cumplimiento). ¿Forzar cambio de contraseña en primer login?
5. **¿`reset-password` auto-loguea (devuelve JWT) o redirige a login?** Propuesta: redirige a login (más simple/seguro).
6. **Coste bcrypt**: mantener 10 (recomendado) vs subir. Si se sube, change separado.
7. **Rate limiting**: ¿se añade en este change (forgot/reset/login) o se difiere? Recomendado añadir al menos en forgot/reset.

> Sin estas decisiones aprobadas, no se inicia Fase 2 (regla HUMAN-IN-THE-LOOP: seguridad + migración).
