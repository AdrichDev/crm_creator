# Design: BD en onboarding + export conecta

## Frente 1 — "Probar" de Maps (front)
`front/components/config/tenant-keys-panel.tsx` función `probar` (línea 112-144):
- Eliminar la rama especial `if (kind === 'maps') { apiFetch('/tenant-config') ... }`.
- Todos los kinds pasan por `testSecret(businessId, name, pending || undefined)` — que
  interpola `businessId` en el path (correcto) y `provider-test.ts` ya prueba Maps con
  geocode (`provider-test.ts:113-122`). Sin cambios en el back.
- Motivo del bug: `apiFetch` pisa `x-business-id` con el negocio ACTIVO
  (`client.ts:63-64`), así que `/tenant-config` leía otro tenant.

## Frente 2 — Slots Supabase + gate de export

### 2.1 Catálogo (back) — `back/src/lib/tenant-secrets/catalog.ts`
- Extender `SecretSlotName` con `'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'`.
- Extender `SecretProvider` con `'supabase'`.
- Añadir dos slots a `TENANT_SECRET_CATALOG`:
  ```
  { name: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', scope: 'FRONTEND_PUBLIC',
    provider: 'supabase', envVarName: 'NEXT_PUBLIC_SUPABASE_URL', group: 'database' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase anon key', scope: 'FRONTEND_PUBLIC',
    provider: 'supabase', envVarName: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', group: 'database' },
  ```
- `readBakeableSecrets` (store.ts) los recoge sin cambios (son FRONTEND_PUBLIC + envVarName).

### 2.2 provider-test (back) — `back/src/lib/tenant-secrets/provider-test.ts`
- Extender `SecretProvider` con `'supabase'` y añadir `case 'supabase'`.
- Validación de **formato local** (sin red, para no añadir flakiness):
  - value que empieza por `http` → validar `new URL(value)` parseable y protocolo https
    → ok; si no, `{ ok:false, detail:'URL de Supabase inválida' }`.
  - en otro caso → validar patrón JWT-ish `^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.` → ok;
    si no, `{ ok:false, detail:'anon key con formato inválido' }`.
  - NUNCA interpolar `value` en `detail`.
- El route handler (`routes/tenant-keys.ts`) ya mapea `slot.provider` → `testProviderConnection`.

### 2.3 Front panel/API
- `front/lib/api/tenant-keys.ts`: añadir los 2 nombres a `KNOWN_PRESET_NAMES` (para que no
  caigan en "Otras variables"); añadir `'supabase'` al union `provider` de
  `TenantSecretTestResult`.
- `front/components/config/tenant-keys-panel.tsx`: añadir al `CATALOG` (línea 23) dos
  entradas `group:'database'`, `kind:'supabase'`; extender el tipo `kind`. Placeholder de
  input para supabase (url / anon). Como `probar` ya no ramifica por maps, `kind:'supabase'`
  usa `testSecret` sin más.

### 2.4 Gate de export (back) — `back/src/routes/exports.ts`
Tras resolver `publicEnvSecrets` (línea 442) y ANTES de `startJob` (línea 468):
```
const baked = new Set(publicEnvSecrets.map((s) => s.envVarName));
const missing: string[] = [];
if (!config.api?.url) missing.push('NEXT_PUBLIC_API_URL');
if (!baked.has('NEXT_PUBLIC_SUPABASE_URL')) missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!baked.has('NEXT_PUBLIC_SUPABASE_ANON_KEY')) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (missing.length) {
  return res.status(422).json({ error: {
    code: 'export_missing_db_config',
    message: `Configura en el onboarding antes de exportar: ${missing.join(', ')}`,
  }, missing });
}
```
Convierte el fail-open de estas 3 vars imprescindibles en fail-closed. El resto de
secretos sigue fail-open.

## Impacto en tipos (mantener sincronizado)
`'supabase'` como provider aparece en: `catalog.ts` SecretProvider, `provider-test.ts`
SecretProvider, `tenant-keys.ts` (front) TestResult.provider. Los tres deben añadirlo.

## No cambia
Migraciones (ninguna), `store.ts`, contrato del `PUT /secrets/:name`, backend routing
multi-BD (out of scope).
