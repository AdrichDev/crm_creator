# Tareas — crm-tenant-api-keys

Nivel 3. Migración 1. Fundación de superficie tenant-facing. Orden = modelo → cifrado →
middleware → rutas tenant → rutas operador. Agentic Runtime gate antes de cualquier push.

## WU1 — Modelo + cifrado (back/DB)
- [x] 1.1 Enum `TenantSecretScope` + modelos `TenantApiKey`, `TenantSecret` + relaciones en `Business` (`schema.prisma`).
- [x] 1.2 Migración `<ts>_tenant_api_keys/migration.sql` (CREATE only, sin DROP). ⚠️ PENDIENTE APLICAR por usuario.
- [x] 1.3 `back/src/lib/tenant-secrets/crypto.ts` (AES-256-GCM + keyVersion) + validación `SECRETS_MASTER_KEY` en `env.ts`.
- [x] 1.4 Test `tenant-secrets.crypto.test.ts` (round-trip, authTag manipulado, cross-version).

## WU2 — Middleware + tenant-facing
- [x] 2.1 `back/src/middleware/tenant-api-key.ts` (`resolveTenantApiKey`) + `tenantBusinessId?` en `AuthedRequest` (`middleware/types.ts`).
- [x] 2.2 `back/src/lib/tenant-secrets/store.ts` (`readTenantSecret` server-side, `readPublicSecrets`).
- [x] 2.3 `back/src/routes/tenant-config.ts` (`GET /tenant-config`, solo FRONTEND_PUBLIC) + registro en `routes/index.ts`.
- [x] 2.4 Tests `tenant-api-key.middleware.test.ts` + `tenant-config.route.test.ts` (backend secret nunca servido).

## WU3 — Gestión de operador
- [x] 3.1 Endpoints api-keys (emitir/list/rotate/revoke) bajo `requireOperatorToken` en `/service/operator`.
- [x] 3.2 Endpoints secrets (alta/list/rotate) bajo `requireOperatorToken`.
- [x] 3.3 Tests `api-keys.operator.test.ts` + `secrets.operator.test.ts` (token una vez, solo hash, valor nunca expuesto).

## Cierre
- [x] Z.1 back suite verde + `tsc` limpio (+ tests nuevos).
- [ ] Z.2 Agentic Runtime review (foco: fuga de secretos, timing, scope leak cross-tenant). → delegar a `sdd-verify`/`/code-review`, fuera de alcance de esta fase apply.
- [ ] Z.3 Migración APLICADA a Supabase + `prisma migrate status` sin drift. → PENDIENTE, el usuario la aplica manualmente (fuera de alcance de esta fase apply).
- [x] Z.4 Engram persistido + ESTRUCTURA.md actualizado.

## Verificaciones finales
- [x] `GET /tenant-config` con clave de negocio A nunca devuelve secretos de negocio B ni ningún BACKEND_SECRET.
- [x] Token en claro no aparece en logs ni en respuestas salvo la única de emisión.
