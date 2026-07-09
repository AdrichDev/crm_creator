# Diseño técnico — crm-env-contract-tiers

## 1. Modelo de tiers (contrato documentado)

Documento nuevo `docs/ENV-CONTRACT.md` (fuente única del contrato; `.env.example` es su
proyección para el front exportado). Tabla resumen del contrato:

| Variable / secreto | Tier 1 (operador: back+DB) | Tier 2 (operador: back; DB cliente) | Tier 3 (cliente aloja todo) |
|---|---|---|---|
| `DATABASE_URL` (`?schema=crm`) | env host operador | env host operador, **apunta a DB del cliente**, instancia aislada | env del cliente |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | env host operador | env host operador (instancia aislada) | env del cliente |
| `ANTHROPIC_API_KEY` (operador) | env host operador (fallback medido) | ídem | n/a (el cliente pone la suya) |
| Clave IA propia del cliente (OpenAI/Anthropic) | `TenantSecret BACKEND_SECRET` | `TenantSecret BACKEND_SECRET` | env del cliente |
| Credencial WhatsApp del cliente | `TenantSecret BACKEND_SECRET` | `TenantSecret BACKEND_SECRET` | env del cliente |
| Clave Google Maps del cliente | `TenantSecret FRONTEND_PUBLIC` + `envVarName=NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → horneada en export | ídem | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` en su `.env.local` (documentada en `.env.example`) |
| `PLATFORM_API_URL` / `TENANT_ID` / `TENANT_API_KEY` | horneadas por export (`crm-export-runtime-config`) | ídem | placeholders en `.env.example` |
| `AUTOMATION_WEBHOOK_*`, `GOOGLE_OAUTH_*` (opcionales) | env host operador | env host operador (instancia aislada) | env del cliente |

Reglas del contrato (normativas, no código):
- **R1.** Un `BACKEND_SECRET` jamás sale del servidor: ni por HTTP (`crm-tenant-api-keys`)
  ni horneado en un export (este change).
- **R2.** Tier 2 exige una instancia de back por cliente. Prohibido un env compartido con
  credenciales de DB de más de un propietario.
- **R3.** Todo secreto `FRONTEND_PUBLIC` con `envVarName` es, por definición, público en
  el bundle: solo claves diseñadas para exposición (restringidas por referrer/origen en la
  consola del tercero).
- **R4.** Sin clave propia del tenant para una integración con fallback → se usa la del
  operador y el uso es medible (`source='operator'`, ref. `crm-ai-proxy`).

## 2. Delta de modelo de datos (aditivo, sobre `crm-tenant-api-keys`)

Columna nueva en `TenantSecret` (modelo definido por `crm-tenant-api-keys`):

```prisma
model TenantSecret {
  // ... campos de crm-tenant-api-keys ...
  envVarName String? @map("env_var") // solo FRONTEND_PUBLIC; ^NEXT_PUBLIC_[A-Z0-9_]+$
}
```

- Nullable: un `FRONTEND_PUBLIC` sin `envVarName` se sirve por `/tenant-config` pero no
  se hornea (flag runtime puro). Un `BACKEND_SECRET` nunca lo lleva (validación de alta).
- Migración `back/prisma/migrations/<ts>_tenant_secret_env_var/migration.sql`:
  `ALTER TABLE tenant_secret ADD COLUMN env_var TEXT;` — sin DROP, aplicada DESPUÉS de la
  migración de `crm-tenant-api-keys`. La aplica el usuario (gotcha EPERM
  `prisma generate` en Windows; verificar con `prisma migrate status`).
- Validación en el alta de secreto (endpoint de operador de `crm-tenant-api-keys`,
  extendido aquí): si llega `envVarName` → exigir `scope=FRONTEND_PUBLIC`, regex
  `^NEXT_PUBLIC_[A-Z0-9_]+$`, y rechazar valores de secreto con `\n`/`\r`.

## 3. Helper de resolución por negocio (back)

En `back/src/lib/tenant-secrets/store.ts` (archivo creado por `crm-tenant-api-keys`;
aquí se añade una función):

```ts
type TenantSecretResolution = { value: string; source: 'tenant' | 'operator' } | null;

async function getTenantSecret(
  businessId: string,
  name: string,
  opts?: { fallbackEnv?: string } // nombre de env var del operador, p. ej. 'ANTHROPIC_API_KEY'
): Promise<TenantSecretResolution>
```

Flujo:
1. `readTenantSecret(businessId, name)` (cualquier scope; uso estrictamente server-side).
2. Si existe → descifra → `{ value, source: 'tenant' }`.
3. Si no y `opts.fallbackEnv` y `process.env[opts.fallbackEnv]` no vacío →
   `{ value, source: 'operator' }`.
4. Si no → `null` (el call-site degrada como hoy: feature desactivada, no crash).

Notas:
- El valor descifrado vive solo en memoria del request; nunca se loguea ni se devuelve en
  respuestas HTTP.
- `source` es la señal que `crm-ai-proxy`/`crm-metering-core` usarán para medir el
  fallback; este change no mide, solo expone la distinción.

### Adopción de referencia
`back/src/routes/branding.ts` (hoy: `env.anthropicApiKey` global,
`back/src/env.ts:21`; si falta → "IA no configurada", `branding.ts:88`):

```ts
const resolved = await getTenantSecret(businessId, 'ANTHROPIC_API_KEY', {
  fallbackEnv: 'ANTHROPIC_API_KEY',
});
```

- Con secreto de negocio → usa la clave del cliente. Sin él → comportamiento idéntico al
  actual (clave del operador o mensaje de "no configurada"). Cero regresión.
- Es LA adopción de referencia: patrón a copiar por WhatsApp y demás integraciones en
  changes posteriores; migrarlas todas queda fuera de alcance.

## 4. Puente build-time (extensión de `buildEnvContent`)

`buildEnvContent(config)` es propiedad de `crm-export-clean-manifest` (§3 de su design:
escritor único del `.env.local` generado, usado por los 4 builders). Este change lo
extiende sin crear un segundo escritor:

```ts
// Firma extendida (compatible): las claves públicas llegan ya resueltas
buildEnvContent(config: TenantConfig, publicEnvSecrets?: Array<{ envVarName: string; value: string }>)
```

- El job de export (`back/src/routes/exports.ts` / `export-job-manager`) resuelve ANTES
  de invocar a los builders: `readPublicSecrets(businessId)` filtrado a
  `envVarName != null` → descifra → pasa la lista a cada builder. Los builders no tocan
  Prisma ni crypto: reciben pares nombre→valor listos.
- `buildEnvContent` añade una línea `<envVarName>=<value>` por entrada, tras las
  variables existentes (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TENANT_JSON`, y las de
  `crm-export-runtime-config` si ya aterrizó). Colisión de nombre con una variable base
  → gana la base y se registra warning en el job (un tenant no puede pisar
  `NEXT_PUBLIC_API_URL` vía secreto).
- Defensa en profundidad dentro de `buildEnvContent`: re-valida
  `^NEXT_PUBLIC_[A-Z0-9_]+$` y ausencia de saltos de línea aunque el alta ya lo validara
  (los datos pueden ser previos a la validación).
- `BACKEND_SECRET` no entra jamás en esta ruta: `readPublicSecrets` ya filtra por
  `scope=FRONTEND_PUBLIC` (frontera de `crm-tenant-api-keys`).
- Aplica a los 4 formatos por igual (web-zip/apk/exe/ipa): comparten `buildEnvContent`.

## 5. `.env.example` como contrato completo (tier 3)

`front/.env.example` regenerado, agrupado por bloques, placeholder + comentario por
variable, NUNCA valores reales:

```bash
# --- Plataforma (crm-export-runtime-config) ---
PLATFORM_API_URL=            # URL del backend de plataforma
TENANT_ID=                   # identificador del negocio
TENANT_API_KEY=              # clave portador emitida por el operador

# --- API propia (modelo SaaS con backend del tenant) ---
NEXT_PUBLIC_API_URL=         # URL del backend propio, si existe

# --- Terceros (claves públicas, restringir por referrer) ---
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=   # obligatoria si la app usa mapas (front/lib/maps/loader.ts lanza si falta)

# --- Supabase (solo si el despliegue lo consume directamente) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

(Contenido definitivo en la tarea: se audita `front/` buscando todo `process.env.*` /
`NEXT_PUBLIC_*` consumido para que el contrato sea exhaustivo, no solo estos bloques.)

Propiedad coordinada: `crm-export-clean-manifest` allowlista `.env.example` en el
manifiesto; este change define su contenido. Si clean-manifest no ha aterrizado, el
archivo se regenera igual en `front/` (viaja por la vía actual).

## 6. Archivos afectados (rutas reales)

- `docs/ENV-CONTRACT.md` — nuevo, contrato de tiers (§1).
- `front/.env.example` — regenerado como contrato completo (§5).
- `back/prisma/schema.prisma` — `envVarName` en `TenantSecret` (delta sobre
  `crm-tenant-api-keys`).
- `back/prisma/migrations/<ts>_tenant_secret_env_var/migration.sql` — ADD COLUMN, sin
  DROP.
- `back/src/lib/tenant-secrets/store.ts` — `getTenantSecret` (+ tipo
  `TenantSecretResolution`).
- `back/src/routes/branding.ts` — adopción de referencia (clave IA por negocio con
  fallback).
- `back/src/lib/export-builders/*` — punto único donde `buildEnvContent` recibe
  `publicEnvSecrets` (archivo exacto según dónde lo deje `crm-export-clean-manifest`).
- `back/src/routes/exports.ts` / job de export — resolución de `publicEnvSecrets` antes
  de invocar builders.
- Endpoint de alta de secreto de operador (de `crm-tenant-api-keys`) — validación de
  `envVarName` (§2).

## 7. Data flow

```
Alta (operador) ──▶ POST /service/operator/businesses/:id/secrets
   { name, scope: FRONTEND_PUBLIC, value, envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' }
   → valida regex + scope + sin \n → cifra → persiste

Export ──▶ job resuelve readPublicSecrets(businessId) [envVarName != null] → descifra
   → buildEnvContent(config, publicEnvSecrets) → .env.local generado con NEXT_PUBLIC_*
   → next build hornea el valor en el bundle (público por diseño, R3)
   [BACKEND_SECRET nunca entra: filtrado por scope]

Runtime back ──▶ branding.ts → getTenantSecret(businessId, 'ANTHROPIC_API_KEY',
   { fallbackEnv: 'ANTHROPIC_API_KEY' })
   → tenant: clave propia | operator: clave del operador (medible) | null: degrada
```

## 8. Estrategia de test (back node:test)

- `tenant-secrets.store.test.ts` (extiende el de `crm-tenant-api-keys`):
  `getTenantSecret` devuelve `source='tenant'` con secreto; `source='operator'` con solo
  env; `null` sin ninguno; nunca loguea el valor.
- `secrets.operator.envvar.test.ts`: alta con `envVarName` válido OK; rechaza regex
  inválida, `envVarName` sobre `BACKEND_SECRET`, y valor con salto de línea.
- `build-env-content.test.ts`: dado config + 1 secreto público con `envVarName`, el
  contenido incluye la línea `NEXT_PUBLIC_*`; un `BACKEND_SECRET` del mismo negocio
  nunca aparece; colisión con variable base no la pisa; secreto sin `envVarName` no se
  hornea.
- `branding.route.test.ts` (extensión): negocio con secreto propio usa esa clave;
  negocio sin secreto conserva el comportamiento actual (fallback operador / "no
  configurada").
- Verificación estática: `front/.env.example` contiene toda variable `process.env.*`
  consumida en `front/` (test o script de auditoría en el WU1).

## 9. Migración

`<ts>_tenant_secret_env_var/migration.sql`: `ALTER TABLE tenant_secret ADD COLUMN
env_var TEXT;`. Aditiva, sin DROP, dependiente de la migración de
`crm-tenant-api-keys`. La aplica el usuario; verificar con `prisma migrate status`.
