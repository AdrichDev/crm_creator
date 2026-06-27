# Design — crm-perfil-editable

**Nivel Gru: 3.** Toca auth/seguridad. Requiere revisión cybersec antes de habilitar.

## 0. Estado real
- `User` (Prisma): `firstName @map(nombre)`, `lastName @map(apellido)`, `phone @map(telefono)`, `email`. Sesión vía Supabase Auth (ES256/JWKS).
- `/auth/me` devuelve `{ id, email, firstName }` — habrá que añadir `lastName`, `phone`.
- `change-password` (auth.ts) updatea vía `supabaseAdmin.auth.admin.updateUserById` SIN verificar la antigua → se endurece aquí.
- `forgot-password` ya existe (Supabase `resetPasswordForEmail`).

## 1. Datos de perfil (nombre/apellido/teléfono)

### Back
- Nuevo endpoint `PATCH /auth/profile` (autenticado): body `{ firstName, lastName?, phone? }` validado con zod. Actualiza la fila `User` del `req.userId` (Prisma). Opcional: espejar `firstName` en `user_metadata` de Supabase si algo lo lee.
- `/auth/me` amplía la respuesta con `lastName` y `phone`.

### Front
- "Mi Cuenta": form con nombre, apellido, teléfono (precargados de `/auth/me`). Guardar → `PATCH /auth/profile` → refresca.

## 2. Cambio de contraseña (con antigua) — SEGURIDAD

Supabase no expone "verifica esta contraseña". Para exigir la antigua se **reautentica**:

**DECISIÓN (tras devil's advocate 2026-06-26): server-side.** La opción front queda DESCARTADA.

Motivo (evidencia): el endpoint `POST /auth/change-password` (`auth.ts:234`) YA existe y hace `admin.updateUserById` + `admin.signOut(uid,'others')`; el front (`lib/api/account.ts`, `change-password-form.tsx`) ya manda `{oldPassword,newPassword,repeat}`. El único hueco real: `changeSchema` (auth.ts:229) NO incluye `oldPassword` y nunca la verifica. Reautenticar en el FRONT con `signInWithPassword` **reemplaza la sesión del navegador** y re-dispara `onAuthStateChange` → reabre el deadlock conocido (memoria `aa-login-deadlock-onauthstatechange`); además pega al rate-limit de login de GoTrue (puede bloquear el login del usuario).

**Flujo elegido (back):**
1. `POST /auth/change-password` (autenticado): `changeSchema` añade `oldPassword`.
2. Verificar la antigua con un cliente Supabase **efímero** (`createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })`) → `signInWithPassword({ email, password: oldPassword })`. Si error → 401 "contraseña actual incorrecta". Este client NO toca la sesión del navegador del usuario.
3. Si OK → `supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword })`.
4. `admin.signOut(userId, 'others')` (ya existente) para invalidar otras sesiones.

> Ventaja: cero side-effects en la sesión del usuario, sin `onAuthStateChange` reentrante, rate-limit bajo control del back. Reusa el endpoint existente (menos trabajo). Mismo contrato que `aa-perfil-editable`.

Política de contraseña: reutilizar `validatePassword` (mín. 12, letra + número).

## 3. "¿No recuerdas tu contraseña?"
Botón en la sección de contraseña → dispara el reset existente (`forgot-password` / `resetPasswordForEmail`) al email del usuario. Mensaje neutro "te hemos enviado instrucciones".

## 4. Seguridad
| Riesgo | Mitigación |
|---|---|
| Cambiar pass sin la antigua | Reautenticación obligatoria (signInWithPassword) antes de updateUser. |
| Fuga de contraseña en logs | Nunca loguear old/new password. |
| Editar perfil de otro usuario | El endpoint usa `req.userId` de la sesión; ignora cualquier id del body. |
| Inyección en nombre/teléfono | zod + escape al renderizar. |

Clasificación: toca auth/credenciales → **revisión cybersec:blueteam + aprobación** antes de habilitar en real.

## 5. Plan por fases
- **A**: `/auth/me` amplía (lastName, phone) + `PATCH /auth/profile` + tests.
- **B**: Front "Mi Cuenta" datos (nombre/apellido/teléfono).
- **C**: Cambio de contraseña con antigua (flujo SDK) + enlace a reset + tests.
