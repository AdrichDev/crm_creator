# Proposal — Gestión de usuarios y autenticación

**Nivel Gru: 4 — Crítica** (toca auth, seguridad, datos persistentes, migración).
**Estado: PENDIENTE.** Requiere aprobación humana antes de implementar (HUMAN-IN-THE-LOOP: seguridad + migración).

## Intención
Dar a cada proyecto CRM gestión real de usuarios y credenciales, hoy ausente (solo existe
`/auth/register|login|me` y perfiles demo en front via `DEMO_USERS`).

## Alcance
1. **Admin crea usuarios** dentro de su negocio: indica email + nombre + rol (`ADMIN` | `EMPLOYEE`/trabajador).
   - El sistema **genera una contraseña** y la guarda **hasheada** (bcrypt) en la BD (`User.passwordHash`).
   - La contraseña en claro se **envía por email** al usuario (vía n8n, ver `crm-n8n-automations`).
2. **Cambio de contraseña** (usuario logueado, admin o trabajador): formulario antigua + nueva + repetir.
   - Verifica la antigua, valida fuerza, re-hashea.
3. **Recuperación de contraseña por email**: flujo "olvidé mi contraseña" → token de un solo uso con expiración → email con enlace (n8n) → set new password.
4. **UI** en Configuración (tab "Usuarios", solo admin) con el look del panel (tokens `--panel-*`).

## Fuera de alcance
- SSO / OAuth. MFA. (futuros)
- Migración a Supabase Auth (futuro; este diseño debe ser portable).

## Contexto técnico
- Back: Express + Prisma. `User` (email único, passwordHash, status), `Membership` (role `MemberRole`).
  `lib/auth.ts` ya tiene `hashPassword/verifyPassword/signToken`.
- Front: rol activo simulado con `DEMO_USERS` + `useRole`. Habrá que conectar login real progresivamente.
- Email: n8n (docker-compose `--profile n8n`, webhook + API key). Sin SMTP propio.

## Riesgos
- Seguridad: generación/almacenamiento/envío de credenciales. Tokens de reset deben caducar y ser de un solo uso.
- Migración: nuevos campos/tablas (`PasswordResetToken`). Aditiva, no destructiva (ver gotcha `crm_project`/`tenants_registry`).
- No exponer nunca passwordHash ni el token por API de lectura.
