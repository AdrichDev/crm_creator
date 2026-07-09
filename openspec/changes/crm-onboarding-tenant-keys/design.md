# Diseño técnico — crm-onboarding-tenant-keys

## 1. `back/src/lib/tenant-secrets/provider-test.ts` (nuevo, módulo puro compartido)

Sin `Request`/`Response`/Prisma. Solo `fetch`/conexión con `AbortController`/timeout. Es el ÚNICO
punto que contacta a un proveedor externo o a la BD del tenant, y lo importan tanto este change como
`crm-tenant-keys-self-service` (dependencia dura declarada en su `design.md`).

```ts
export type SecretProvider = 'openai' | 'gemini' | 'anthropic' | 'maps' | 'database';

export interface ProviderTestResult {
  ok: boolean;
  detail?: string; // mensaje corto; NUNCA el value probado ni el body/URL crudo
}

export async function testProviderConnection(
  provider: SecretProvider,
  value: string,
): Promise<ProviderTestResult> {
  const timeoutMs = 5_000;
  try {
    switch (provider) {
      case 'openai':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${value}` }, signal,
          });
          return r.ok ? { ok: true } : { ok: false, detail: `openai respondió ${r.status}` };
        });
      case 'gemini':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`,
            { signal });
          return r.ok ? { ok: true } : { ok: false, detail: `gemini respondió ${r.status}` };
        });
      case 'anthropic':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': value, 'anthropic-version': '2023-06-01' }, signal,
          });
          return r.ok ? { ok: true } : { ok: false, detail: `anthropic respondió ${r.status}` };
        });
      case 'maps':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${encodeURIComponent(value)}`,
            { signal });
          const body = await r.json().catch(() => ({}));
          const denied = body?.status === 'REQUEST_DENIED' || body?.status === 'INVALID_REQUEST';
          return denied ? { ok: false, detail: `maps: ${body?.status ?? 'sin respuesta'}` } : { ok: true };
        });
      case 'database':
        // Conexión de solo lectura, timeout corto. Usa el pool de `pg` (ya dependencia vía
        // @prisma/adapter-pg). Parsea la URL, abre conexión, ejecuta `SELECT 1`, cierra.
        return await testDatabaseUrl(value, timeoutMs);
    }
  } catch {
    // AbortError (timeout) o fallo de red/conexión: nunca se interpola `value` ni el error crudo.
    return { ok: false, detail: 'timeout o error de conexión al contactar al recurso' };
  }
}
```

- `testWithTimeout(timeoutMs, fn)`: helper interno con `AbortController` + `setTimeout` que aborta el
  `fetch` y limpia el timer en `finally`.
- `testDatabaseUrl(value, timeoutMs)`: helper interno que crea un `pg.Client`/`Pool` de un solo uso a
  partir de la cadena `postgresql://…`, con `connectionTimeoutMillis`/`query_timeout` cortos, ejecuta
  `SELECT 1`, y cierra la conexión en `finally`. Nunca interpola la cadena en un `detail`; en fallo
  devuelve `{ ok: false, detail: 'no se pudo conectar a la base de datos' }`.
- **`value` nunca se loguea.** Ningún `console.*` de este módulo referencia `value`; los `detail`
  solo llevan status HTTP, `status` de Google, o un mensaje genérico. Para `database`, el `detail`
  jamás incluye host/usuario/contraseña de la cadena.
- La variante `'maps'` (llamada real a Google) existe por completitud del tipo; el panel de este
  change NO la usa desde la tarjeta de Maps (usa la confirmación de propagación runtime, §6).

## 2. Auth: sesión + `Membership`, `businessId` del path validado como `projects.ts:111`

Router nuevo `back/src/routes/tenant-keys.ts`, montado en `back/src/routes/index.ts` bajo el
middleware `authenticate` ya existente (que puebla `req.userId` desde la sesión Supabase):

```ts
api.use(authenticate);
// ...
api.use('/tenant-keys', tenantKeysRouter);
```

Las 4 rutas llevan `:businessId` en el path y comparten un helper de autorización, calcado del patrón
canónico `PATCH /projects/:id` (`back/src/routes/projects.ts:109-136`):

```ts
async function requireMemberAdmin(req, res): Promise<Membership | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId: req.userId, businessId: req.params.businessId },
  });
  if (!membership) { res.status(404).json({ error: { code: 'not_found' } }); return null; }
  if (membership.role !== 'ADMIN' && membership.role !== 'MANAGER') {
    res.status(403).json({ error: { code: 'forbidden' } }); return null;
  }
  return membership;
}
```

- **Cross-tenant estructuralmente cerrado:** `businessId` proviene del path, pero el handler nunca lo
  usa sin antes confirmar que existe una `Membership` de `req.userId` para ese `businessId`. Si no la
  hay → 404 (mismo comportamiento que `projects.ts:111`). Un usuario solo puede operar sobre los
  negocios de los que es miembro; forjar un `:businessId` ajeno cae en el 404.
- **El rol se gatea sobre la membership del `:businessId` del path, NO sobre `req.role`.**
  `requireRole` (`back/src/middleware/rbac.ts:6`) usa `req.role`, que `authenticate` resuelve desde el
  `x-business-id` **activo** de la sesión. En onboarding el `:businessId` editado puede diferir del
  negocio activo del operador, así que el gate correcto es el `membership.role` recién leído para el
  path — por eso el gate va en el helper `requireMemberAdmin`, no en un `router.use(requireRole(...))`.
- **Por qué una sola ruta con `:businessId` sirve a las dos superficies:** el operador de onboarding
  es miembro `ADMIN` del negocio que edita; el `ADMIN`/`MANAGER` en autoservicio es miembro de su
  propio negocio. Ambos pasan el `membership.findFirst`. La única diferencia es el `businessId` que el
  front pone en el path (onboarding = `editing.id`; autoservicio = su `businessId` de sesión). No hace
  falta un router self-service separado; `crm-tenant-keys-self-service` reutiliza estas mismas rutas.

## 3. Los 4 endpoints (shape)

Catálogo importado de `back/src/lib/tenant-secrets/catalog.ts` (§5).

### `GET /tenant-keys/:businessId/secrets`
`requireMemberAdmin` → 200 con los 5 slots en orden fijo del catálogo, nunca el valor:

```json
{
  "secrets": [
    { "name": "OPENAI_API_KEY",      "label": "OpenAI",      "scope": "BACKEND_SECRET",  "envVarName": null,                          "configured": true,  "updatedAt": "2026-07-09T10:00:00.000Z" },
    { "name": "GEMINI_API_KEY",      "label": "Gemini",      "scope": "BACKEND_SECRET",  "envVarName": null,                          "configured": false, "updatedAt": null },
    { "name": "ANTHROPIC_API_KEY",   "label": "Anthropic",   "scope": "BACKEND_SECRET",  "envVarName": null,                          "configured": false, "updatedAt": null },
    { "name": "GOOGLE_MAPS_API_KEY", "label": "Google Maps", "scope": "FRONTEND_PUBLIC", "envVarName": "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "configured": true, "updatedAt": "2026-07-08T09:30:00.000Z" },
    { "name": "DATABASE_URL",        "label": "URL de conexión (BD)", "scope": "BACKEND_SECRET", "envVarName": null,                  "configured": false, "updatedAt": null }
  ]
}
```
- `prisma.tenantSecret.findMany({ where: { businessId, name: { in: CATALOG_NAMES } }, select: { name: true, updatedAt: true } })` — sin tocar `valueCiphertext`/`iv`/`authTag`; el `select` hace imposible
  que el cifrado llegue a memoria del handler. Los slots ausentes se rellenan con `configured: false`.

### `PUT /tenant-keys/:businessId/secrets/:name`
Body: `{ "value": "..." }`. `scope`/`envVarName`/`name` del body se ignoran (los fija el catálogo).
- `:name` fuera del catálogo → 404 `{ error: { code: 'unknown_secret' } }`.
- `value` ausente/vacío/con `\r`/`\n` → 422 `{ error: { code: 'invalid' } }` (mismo chequeo que
  `upsertSecretHandler` para no romper `.env.local` horneado).
- Éxito → `encryptSecret(value)` (`back/src/lib/tenant-secrets/crypto.ts`) +
  `prisma.tenantSecret.upsert({ where: { businessId_name: { businessId, name } }, create: {...scope/envVarName del catálogo...}, update: {...} })` → 200 `{ name, label, scope, envVarName, configured: true, updatedAt }`. El valor NUNCA vuelve en la respuesta.

### `DELETE /tenant-keys/:businessId/secrets/:name`
- `:name` fuera del catálogo → 404 `unknown_secret`.
- No hay fila `(businessId, name)` → 404 `{ error: { code: 'secret_not_found' } }`.
- Éxito → `prisma.tenantSecret.delete({ where: { businessId_name: { businessId, name } } })` (hard
  delete) → 200 `{ name, configured: false }`. El slot vuelve al `fallbackEnv` del operador si la
  lectura server-side (`getTenantSecret(..., { fallbackEnv })`) lo define.

### `POST /tenant-keys/:businessId/secrets/:name/test`
Rate-limited (`testSecretLimiter`, bucket `secret-test`, `windowMs: 60_000`, `max: 5`, clave
`${businessId}:${name}`, sobre `back/src/lib/rateLimit.ts`). Body opcional `{ "value"? }`.
- `:name` fuera del catálogo → 404 `unknown_secret`.
- `value` del body si llega (permite probar ANTES de guardar); si no, se descifra el guardado
  (`readTenantSecret(businessId, name)`); si no hay ninguno → 404 `{ error: { code: 'no_value' } }`.
- Traduce `name` → `provider` del catálogo y llama `testProviderConnection(provider, value)`.
- 200 SIEMPRE que el request sea válido: `{ name, provider, ok, detail? }`. Un rechazo del proveedor
  (clave inválida, cuota) es `ok: false`, NUNCA un 4xx/5xx de este endpoint. El `value` nunca vuelve.
- **Maps es la excepción:** la tarjeta de Maps del panel NO llama a este endpoint; usa la confirmación
  de propagación runtime del front (§6). El endpoint acepta `GOOGLE_MAPS_API_KEY` y delega en
  `testProviderConnection('maps', value)` (validez ante Google) por completitud, disponible para quien
  quiera un "Probar conexión" literal, pero el panel prefiere la confirmación de propagación.

### Errores comunes
- Sin sesión / token inválido → 401 (responde `authenticate`, antes del router).
- No miembro del `:businessId` → 404 `not_found`; miembro `EMPLOYEE`/`CLIENT` → 403 `forbidden`
  (ambos en `requireMemberAdmin`).

## 4. Borrado: hard delete, no tombstone
`TenantSecret` no tiene campo de baja lógica y no hay consumidor que necesite distinguir "nunca
configurado" de "configurado y borrado" (a diferencia de `TenantApiKey.revokedAt`, que preserva
histórico de auditoría). Un `TenantSecret` borrado no deja rastro útil: su `valueCiphertext` no es
legible sin la clave maestra, y `name`/`scope`/`envVarName` son metadatos de catálogo reconstruibles.
Añadir `deletedAt` exigiría migración + filtro `deletedAt: null` en `readTenantSecret`/
`readPublicSecrets`/`readBakeableSecrets`/el `GET` de estado, sin beneficio de auditoría real.

## 5. Catálogo fijo `back/src/lib/tenant-secrets/catalog.ts` (nuevo, única fuente de verdad)

```ts
export type SecretSlotName =
  | 'OPENAI_API_KEY' | 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY'
  | 'GOOGLE_MAPS_API_KEY' | 'DATABASE_URL';
export type SecretProvider = 'openai' | 'gemini' | 'anthropic' | 'maps' | 'database';

export interface SecretSlot {
  name: SecretSlotName;
  label: string;
  provider: SecretProvider;
  scope: 'BACKEND_SECRET' | 'FRONTEND_PUBLIC';
  envVarName: string | null;
  group: 'ai' | 'maps' | 'database'; // guía de agrupación visual en el onboarding
}

export const TENANT_SECRET_CATALOG: readonly SecretSlot[] = [
  { name: 'OPENAI_API_KEY',      label: 'OpenAI',              provider: 'openai',    scope: 'BACKEND_SECRET',  envVarName: null,                              group: 'ai' },
  { name: 'GEMINI_API_KEY',      label: 'Gemini',              provider: 'gemini',    scope: 'BACKEND_SECRET',  envVarName: null,                              group: 'ai' },
  { name: 'ANTHROPIC_API_KEY',   label: 'Anthropic',           provider: 'anthropic', scope: 'BACKEND_SECRET',  envVarName: null,                              group: 'ai' },
  { name: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps',         provider: 'maps',      scope: 'FRONTEND_PUBLIC', envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', group: 'maps' },
  { name: 'DATABASE_URL',        label: 'URL de conexión (BD)', provider: 'database', scope: 'BACKEND_SECRET',  envVarName: null,                              group: 'database' },
] as const;

export function findSecretSlot(name: string): SecretSlot | undefined {
  return TENANT_SECRET_CATALOG.find((s) => s.name === name);
}
```
- Los nombres siguen la convención ya usada en código (`getTenantSecret(businessId, 'ANTHROPIC_API_KEY', { fallbackEnv: 'ANTHROPIC_API_KEY' })`) y `docs/ENV-CONTRACT.md`.
- **Este archivo es la única fuente de verdad del catálogo.** `crm-tenant-keys-self-service` lo importa
  tal cual, no declara una copia.

## 6. Front — componente reutilizable + onboarding paso 4

### `front/components/config/tenant-keys-panel.tsx` (nuevo)
Recibe el `businessId` a operar como prop (`<TenantKeysPanel businessId={...} />`), de modo que el
onboarding le pase `editing.id` y la Configuración le pase el `businessId` de sesión — mismo
componente, misma llamada `apiFetch` a `/tenant-keys/:businessId/secrets`. Estructura calcada de
`front/components/config/integraciones-panel.tsx` (Card/CardBody/Badge/Button, `useDialog`):
- Al montar: `apiFetch<{ secrets: SlotStatus[] }>('/tenant-keys/' + businessId + '/secrets')` → items.
- Una `Card` por slot del catálogo (orden del back):
  - Título = `label`; `Badge` de estado: `no configurado` (gray) / `configurado` (green) / `probando…`
    (amber) / `error de conexión` (red, efímero). NUNCA el valor.
  - Input `password` para pegar/actualizar (nunca prefilled: el back no expone el valor).
  - Botón **Guardar** (`PUT .../secrets/:name`, deshabilitado si el input está vacío) → limpia input y
    refresca estado.
  - Botón **Probar conexión**:
    - AI (`openai`/`gemini`/`anthropic`) y `database` → `POST .../secrets/:name/test` (con `value` del
      input si hay uno sin guardar, o sin body para probar el guardado).
    - `maps` → confirmación de propagación runtime, NO `.../test`: llama `GET /tenant-config` contra el
      backend principal con la sesión activa + `x-business-id: <businessId>` (auth dual aportada por
      `crm-tenant-secrets-runtime-maps`) y comprueba que
      `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` está presente y coincide. `ok` si refleja el
      valor recién guardado; `error` genérico si no. Nunca muestra el valor.
  - Botón **Quitar** (solo si `configured`) con `useDialog().confirm(...)` antes de `DELETE`.
  - Estado por slot `'idle' | 'saving' | 'testing' | 'deleting'`, independiente por tarjeta.
- Prop opcional `groups?: SecretSlot['group'][]` para renderizar solo un subconjunto (el onboarding la
  usa para separar el bloque BD del bloque API Keys; ver abajo).

### `front/app/onboarding/page.tsx` (paso 4)
- `STEPS[3]`: `'Base de datos'` → `'BD, API y Keys'`.
- Bloque `step === 3` (líneas 270-306) se reorganiza en tres sub-bloques:
  1. **Base de datos:** un único input "URL de conexión" que persiste como slot `DATABASE_URL` del
     store cifrado — se renderiza vía `<TenantKeysPanel businessId={editing.id} groups={['database']} />`.
     Se RETIRAN los campos sueltos host/puerto/nombre/usuario/contraseña.
  2. **Backend API:** el input `draft.api.url` (dominio público) se queda tal cual, persistido en el
     config plano de `BusinessSetting` vía `createProject`/`updateProject` (no es secreto).
  3. **API Keys:** `<TenantKeysPanel businessId={editing.id} groups={['ai', 'maps']} />` — las 4
     tarjetas OpenAI/Gemini/Anthropic/Google Maps.
- Como `TenantKeysPanel` escribe directo al store cifrado por slot (llamadas independientes), los
  secretos (URL de BD + 4 keys) NO viajan por `createProject`/`updateProject`; solo el config plano
  (`draft.api.url`, tipo de negocio, módulos, marca, datos) sigue por ahí. El panel requiere que el
  proyecto ya tenga `businessId` (`editing.id`): en alta nueva, el paso guarda primero el proyecto
  base (para obtener `businessId`) y luego habilita el panel de keys — a confirmar en implementación
  el orden exacto del wizard.

## 7. Archivos afectados

| Archivo | Cambio |
|---|---|
| `back/src/lib/tenant-secrets/catalog.ts` | NUEVO — catálogo fijo de 5 slots, única fuente de verdad. |
| `back/src/lib/tenant-secrets/provider-test.ts` | NUEVO — `testProviderConnection` (openai/gemini/anthropic/maps/database) + helpers de timeout. |
| `back/src/routes/tenant-keys.ts` | NUEVO — router con las 4 rutas + `requireMemberAdmin` (membership del path + rol). |
| `back/src/routes/index.ts` | Monta `tenantKeysRouter` en `/tenant-keys` bajo `authenticate`. |
| `front/lib/api/tenant-keys.ts` | NUEVO — cliente REST (`listSecrets`/`upsertSecret`/`deleteSecret`/`testSecret`) sobre `apiFetch`, con `businessId` en el path. |
| `front/components/config/tenant-keys-panel.tsx` | NUEVO — panel reutilizable de tarjetas por slot. |
| `front/app/onboarding/page.tsx` | Paso 4 renombrado; BD → 1 campo URL (slot cifrado); API Keys → panel; backend API se queda plano. |
| `back/src/routes/__tests__/tenant-keys.route.test.ts` | NUEVO — 4 endpoints + membership/rol + cross-tenant + fuga cero. |
| `back/src/lib/tenant-secrets/__tests__/provider-test.test.ts` | NUEVO — `fetch`/conexión mockeados; assert de que `value` nunca aparece en `detail`/logs. |

## 8. Data flow

**Guardar (onboarding o self-service):** humano pega valor en una tarjeta →
`PUT /tenant-keys/:businessId/secrets/:name` → `requireMemberAdmin` (membership del path + rol) →
`encryptSecret` → `TenantSecret` upsert → tarjeta refleja `configurado`, nunca el valor.

**Probar (AI/DB):** click "Probar conexión" → `POST /tenant-keys/:businessId/secrets/:name/test` →
resuelve `value` (body o descifrado) → `testProviderConnection(provider, value)` → llamada real corta
→ `{ ok, detail }` → UI verde/roja.

**Probar (Maps):** click "Probar conexión" → `GET /tenant-config` (sesión + `x-business-id`) → leer
`publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → UI verde si refleja el valor guardado.

**Quitar:** confirmación (`useDialog`) → `DELETE /tenant-keys/:businessId/secrets/:name` → hard delete
→ tarjeta vuelve a `no configurado`.

## 9. Estrategia de test
- `provider-test.test.ts`: `global.fetch` mockeado (y `pg` mockeado para `database`) por caso (`ok`,
  `4xx`/rechazo, timeout que nunca resuelve + `AbortController`); assert de que ningún mock de
  `console.*` recibe `value`, y que la cadena `DATABASE_URL` no aparece en ningún `detail`.
- `tenant-keys.route.test.ts`: por cada endpoint, éxito + errores (`unknown_secret`, `invalid`,
  `secret_not_found`, `no_value`), 404 si `req.userId` no es miembro del `:businessId`, 403 para
  `EMPLOYEE`/`CLIENT` miembros, 429 al 6º `test` en la ventana, y **cross-tenant:** con dos negocios
  A/B y un usuario miembro solo de A, cualquier intento sobre `:businessId = B` → 404, y el
  `TenantSecret` de B queda inalterado tras operar sobre A.
- Fuga cero: ninguna respuesta (200 o error) contiene `valueCiphertext`/`iv`/`authTag` ni el valor en
  claro; ningún log de `/test` contiene el `value` de fixture.
- Front: `tenant-keys-panel.test.tsx` (mock de `apiFetch`) — render de los slots, guardar limpia el
  input, probar ok/error para AI y database, Maps vía `/tenant-config` mockeado, quitar con
  confirmación; el valor tecleado nunca queda en el DOM tras guardar. Onboarding: la prop `groups`
  separa BD de API Keys; el backend API sigue en el config plano.
- No bloqueado: todo lo que consume ya existe en el repo (`crypto.ts`, `store.ts`, `authenticate`,
  `Membership`, `/tenant-config` de `crm-tenant-secrets-runtime-maps`).
