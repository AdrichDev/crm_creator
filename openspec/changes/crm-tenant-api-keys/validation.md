# Validación — crm-tenant-api-keys

Historia: como **operador de la plataforma** quiero emitir a cada negocio una API key
portador y guardarle secretos cifrados (separando lo público de frontend de lo que solo
usa el servidor), para que sus apps y superficies externas hablen con el back con
scoping por negocio sin arrastrar la sesión del panel ni exponer secretos en el cliente.

## Criterios de aceptación (AC)
- **AC1 (auth por clave):** una petición con una `TenantApiKey` válida resuelve el
  `businessId` correcto; con clave ausente, inválida o revocada devuelve 401
  `invalid_api_key`.
- **AC2 (token una vez):** al emitir una clave, el token en claro se devuelve exactamente
  una vez; en BD solo existe su hash SHA-256, nunca el valor.
- **AC3 (scope frontend):** `GET /tenant-config` devuelve solo secretos
  `scope=FRONTEND_PUBLIC` (descifrados) + flags.
- **AC4 (backend secret jamás servido):** ningún secreto `scope=BACKEND_SECRET` aparece
  en la respuesta de `GET /tenant-config` ni en ninguna respuesta HTTP tenant-facing.
- **AC5 (cifrado):** los valores de `TenantSecret` se persisten cifrados AES-256-GCM
  (iv/authTag/keyVersion); un authTag manipulado hace fallar el descifrado.
- **AC6 (rotación de clave):** rotar una clave revoca la anterior (queda inutilizable) y
  emite una nueva; revocar es idempotente.
- **AC7 (rotación de secreto / keyVersion):** un valor cifrado con `keyVersion=1` se
  descifra tras rotar a `keyVersion=2` sin re-emitir el secreto.
- **AC8 (no regresión):** ninguna ruta existente cambia de mecanismo de auth; back tests
  verde, `tsc` limpio, `prisma migrate status` sin drift.

## Por tarea (Given-When-Then + test)
- **WU1.1** Migración → Given migración aplicada, When `prisma migrate status`, Then sin
  drift y existen `tenant_api_key` + `tenant_secret`. Test: `back` schema + migrate status.
- **WU1.2** Cifrado → Given `SECRETS_MASTER_KEY` de test, When encrypt+decrypt, Then
  round-trip OK; authTag alterado lanza; cross-version OK. Test:
  `tenant-secrets.crypto.test.ts`.
- **WU2.1** Middleware → Given clave activa, When request con Bearer, Then
  `req.tenantBusinessId` = negocio; clave revocada → 401. Test:
  `tenant-api-key.middleware.test.ts`.
- **WU2.2** `/tenant-config` → Given negocio con 1 FRONTEND_PUBLIC + 1 BACKEND_SECRET,
  When GET con clave, Then body incluye el público y NO el backend. Test:
  `tenant-config.route.test.ts`.
- **WU3.1** Emitir/rotar/revocar → Given operador, When POST api-keys, Then token una vez
  + solo hash en BD; rotate revoca la vieja; revoke idempotente. Test:
  `api-keys.operator.test.ts`.
- **WU3.2** Secretos operador → Given operador, When POST secret, Then cifrado; GET nunca
  expone valor; rotate cambia `updatedAt`. Test: `secrets.operator.test.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Requiere `SECRETS_MASTER_KEY` en env de back antes de habilitar
la ruta. Migración 1 pendiente de aplicar por el usuario.
