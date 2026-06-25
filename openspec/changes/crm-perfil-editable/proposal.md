# Proposal — Editar perfil de usuario (crm-perfil-editable)

**Nivel Gru: 3 — Grande.** Toca auth/Supabase + datos persistentes + seguridad (cambio de contraseña). Cruza front + back.

## Contexto
Hoy el usuario no puede editar sus propios datos. El back tiene `change-password` (auth.ts) pero **NO verifica la contraseña antigua** (hueco). No hay UI de "Mi Cuenta" para nombre/teléfono. `User` en Prisma ya tiene `firstName (@map nombre)`, `lastName (@map apellido)`, `phone (@map telefono)`.

## Intención
Página/panel "Mi Cuenta" donde el usuario edita:
- **Nombre** (y apellido) y **teléfono**.
- **Contraseña**: requiere introducir la **antigua** + nueva + repetir. Y un botón **"¿No recuerdas tu contraseña?"** que dispara el reset (flujo Supabase ya existente, `forgot-password`).

## Intención de seguridad
Cambiar contraseña SIN saber la antigua = no permitido (salvo el flujo de reset por email). Verificación de la antigua vía Supabase (reautenticación), no comparación en claro.

## Alcance
- **Back**: endpoint para actualizar `firstName/lastName/phone` del usuario logado (Prisma `User`). Endurecer el cambio de contraseña para exigir la antigua (ver design).
- **Front**: componente/página "Mi Cuenta" (reusa/reemplaza `components/config/change-password-form.tsx`): form de datos + sección de contraseña (antigua/nueva/repetir) + enlace a reset.
- Validaciones: política de contraseña existente (mín. 12, letra+número), teléfono formato laxo, nombre no vacío.

## Fuera de alcance
- Cambiar el email (flujo aparte, Supabase change-email con confirmación).
- Avatar/foto.
- El gating del rol cliente (eso es `crm-cliente-solo-mi-cuenta`, que CONSUME esta página).

## Dependencias
- Lo consume `crm-cliente-solo-mi-cuenta` (el cliente solo verá esta página).

## Riesgos
- Reautenticación de la contraseña antigua mal hecha = bypass. Mitiga: usar Supabase `signInWithPassword` para verificar, nunca comparar hashes a mano. Requiere revisión de seguridad.
