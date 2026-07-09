# Diseño técnico — crm-tenant-api-keys

## 1. Modelo de datos (Prisma, schema `crm`, aditivo)

Convención del repo: modelo en inglés, columnas físicas castellano snake_case vía `@map`,
multi-tenant `businessId @map("negocio_id")`. Ambas tablas son **portador/secreto**: sin
soft-delete lógico salvo `revokedAt` (auditable) en la clave.

### 1.1 TenantApiKey (`tenant_api_key`)
```prisma
model TenantApiKey {
  id         String    @id @default(cuid())
  businessId String    @map("negocio_id")
  business   Business  @relation(fields: [businessId], references: [id], onDelete: Cascade)
  tokenHash  String    @unique @map("token_hash")   // SHA-256 hex del token en claro
  prefix     String    @map("prefijo")              // 8 chars visibles, NO secreto
  label      String?   @map("etiqueta")             // nombre humano ("app landing")
  lastUsedAt DateTime? @map("ultimo_uso_en")
  revokedAt  DateTime? @map("revocado_en")          // null = activa
  createdAt  DateTime  @default(now()) @map("creado_en")
  @@index([businessId])
  @@map("tenant_api_key")
}
```
- El token en claro se genera server-side (`prefix` + secreto aleatorio, p. ej.
  `tk_<8prefix>_<random>`), se hashea SHA-256 y se guarda solo el hash. Lookup por
  `tokenHash` (columna `@unique` → índice, sin timing leak del secreto).
- `revokedAt != null` → clave inutilizable (el middleware la rechaza).

### 1.2 TenantSecret (`tenant_secret`)
```prisma
enum TenantSecretScope { FRONTEND_PUBLIC BACKEND_SECRET }

model TenantSecret {
  id             String            @id @default(cuid())
  businessId     String            @map("negocio_id")
  business       Business          @relation(fields: [businessId], references: [id], onDelete: Cascade)
  name           String            @map("nombre")
  scope          TenantSecretScope @default(BACKEND_SECRET) @map("scope")
  valueCiphertext String           @map("valor_cifrado")   // hex, ciphertext AES-256-GCM
  iv             String            @map("iv")               // hex, 12 bytes
  authTag        String            @map("auth_tag")         // hex, 16 bytes
  keyVersion     Int               @default(1) @map("clave_version")
  updatedAt      DateTime          @updatedAt @map("actualizado_en")
  createdAt      DateTime          @default(now()) @map("creado_en")
  @@unique([businessId, name])
  @@index([businessId, scope])
  @@map("tenant_secret")
}
```
- `@@unique([businessId, name])`: un secreto por nombre y negocio; rotar = re-cifrar y
  actualizar (`updatedAt` cambia).
- `keyVersion`: qué versión de `SECRETS_MASTER_KEY` cifró la fila. Rotar la clave maestra
  = descifrar con la versión antigua, re-cifrar con la nueva, subir `keyVersion`.

### 1.3 Relaciones en Business
```prisma
// dentro de model Business
tenantApiKeys TenantApiKey[]
tenantSecrets TenantSecret[]
```

## 2. Cifrado (AES-256-GCM, nivel de app)
Reutiliza el patrón de `back/src/lib/crypto.ts` (iv 12B, authTag 16B, hex). Nuevo helper
para no acoplar a la clave OAuth:
```
back/src/lib/tenant-secrets/crypto.ts
  → encryptSecret(plain, keyVersion=current): { ciphertext, iv, authTag, keyVersion }
  → decryptSecret({ ciphertext, iv, authTag, keyVersion }): string
  → clave desde SECRETS_MASTER_KEY (32 bytes hex/base64); soporta mapa de versiones
    para rotación (SECRETS_MASTER_KEY, SECRETS_MASTER_KEY_V2, ...).
```
- Falta de `SECRETS_MASTER_KEY` → lanza en arranque de la ruta (fail-closed, como el
  helper OAuth existente).

## 3. Middleware `resolveTenantApiKey`
```
back/src/middleware/tenant-api-key.ts
  → export function resolveTenantApiKey()
```
Flujo:
1. Lee header portador (`Authorization: Bearer <token>` o `x-tenant-key`; se fija en el
   spec el header canónico).
2. `tokenHash = sha256hex(token)`; `findUnique({ tokenHash })`.
3. Si no existe **o** `revokedAt != null` → `401 { error: { code: 'invalid_api_key' } }`.
4. Setea `req.tenantBusinessId = key.businessId` (nuevo campo en `AuthedRequest`) y
   dispara `lastUsedAt = now()` (best-effort, no bloquea la respuesta).
5. `next()`.

> No falsea `req.user` ni abre RBAC de panel; es un carril de auth paralelo, igual que
> `requireOperatorToken` no toca el gate de usuario.

## 4. Endpoints

### 4.1 Tenant-facing (auth `resolveTenantApiKey`)
| Ruta | Método | Notas |
|---|---|---|
| `/tenant-config` | GET | Devuelve `{ flags, publicSecrets }` con **solo** scope=FRONTEND_PUBLIC (descifrados) + flags de config del negocio. Nunca BACKEND_SECRET. |

Router nuevo `back/src/routes/tenant-config.ts`, registrado en `back/src/routes/index.ts`
bajo `resolveTenantApiKey` (NO `authenticate`).

### 4.2 Operador (auth `requireOperatorToken`, bajo `/service/operator`)
| Ruta | Método | Notas |
|---|---|---|
| `/service/operator/businesses/:id/api-keys` | POST | Emite clave. Respuesta incluye `token` en claro **una sola vez** + `prefix`,`id`. Persiste solo hash. |
| `/service/operator/businesses/:id/api-keys` | GET | Lista claves (id, prefix, label, lastUsedAt, revokedAt). Sin token en claro. |
| `/service/operator/businesses/:id/api-keys/:keyId/rotate` | POST | Revoca la anterior y emite una nueva (token nuevo una vez). |
| `/service/operator/businesses/:id/api-keys/:keyId/revoke` | POST | `revokedAt = now()`. Idempotente. |
| `/service/operator/businesses/:id/secrets` | POST | Alta/actualización de secreto `{ name, scope, value }`; cifra y upsertea por (businessId,name). Devuelve metadatos, **nunca** el valor. |
| `/service/operator/businesses/:id/secrets` | GET | Lista secretos (name, scope, keyVersion, updatedAt). Sin valores. |
| `/service/operator/businesses/:id/secrets/:name/rotate` | POST | Re-cifra un valor nuevo (o re-envuelve con nueva keyVersion). |

Router en `back/src/routes/service-operator.ts` (o el que agrupe `/service/operator`).

## 5. Data flow
```
App externa del tenant ──Bearer TenantApiKey──▶ /tenant-config
   resolveTenantApiKey → businessId → lee TenantSecret WHERE scope=FRONTEND_PUBLIC
   → descifra (SECRETS_MASTER_KEY) → responde { flags, publicSecrets }
   [BACKEND_SECRET nunca entra en la respuesta]

Back server-side (p. ej. ai-proxy) ──▶ readTenantSecret(businessId, name)
   → lee fila (cualquier scope) → descifra → usa en memoria, no la reenvía al cliente

Operador ──x-service-token──▶ /service/operator/businesses/:id/api-keys (POST)
   → genera token, hashea, persiste hash → responde token EN CLARO una vez
```

## 6. Archivos afectados (rutas reales)
- `back/prisma/schema.prisma` — enum `TenantSecretScope`, modelos `TenantApiKey`,
  `TenantSecret`, relaciones en `Business`.
- `back/prisma/migrations/<ts>_tenant_api_keys/migration.sql` — Migración 1 (CREATE only).
- `back/src/lib/tenant-secrets/crypto.ts` — cifrado con versiones de clave.
- `back/src/lib/tenant-secrets/store.ts` — `readTenantSecret`/`readPublicSecrets` (uso
  server-side y por `/tenant-config`).
- `back/src/middleware/tenant-api-key.ts` — `resolveTenantApiKey`.
- `back/src/middleware/types.ts` — `tenantBusinessId?: string` en `AuthedRequest`.
- `back/src/routes/tenant-config.ts` — `GET /tenant-config`.
- `back/src/routes/service-operator.ts` — endpoints de gestión de claves/secretos.
- `back/src/routes/index.ts` — registro de routers.
- `back/src/env.ts` — validación de `SECRETS_MASTER_KEY`.

## 7. Test strategy (back node:test)
- `tenant-api-key.middleware.test.ts`: clave válida resuelve businessId; revocada → 401;
  ausente → 401; hash correcto de un token conocido.
- `tenant-secrets.crypto.test.ts`: round-trip encrypt/decrypt; authTag manipulado lanza;
  round-trip cross-version (keyVersion 1 vs 2).
- `tenant-config.route.test.ts`: `GET /tenant-config` devuelve solo FRONTEND_PUBLIC;
  un BACKEND_SECRET del mismo negocio nunca aparece en el body.
- `api-keys.operator.test.ts`: emitir devuelve token una vez y persiste solo hash;
  revoke inutiliza; rotate emite nueva y revoca vieja.
- `secrets.operator.test.ts`: alta cifra; GET nunca expone valor; rotate cambia updatedAt.

## 8. Migración
`back/prisma/migrations/<ts>_tenant_api_keys/migration.sql`: `CREATE TYPE scope`,
`CREATE TABLE tenant_api_key` (+ unique tokenHash, index businessId),
`CREATE TABLE tenant_secret` (+ unique (negocio_id,nombre), index (negocio_id,scope)),
FKs a `negocio`. **Sin DROP.** La aplica el usuario (gotcha EPERM `prisma generate` en
Windows: `--no-engine` si falla; verificar con `prisma migrate status`).
