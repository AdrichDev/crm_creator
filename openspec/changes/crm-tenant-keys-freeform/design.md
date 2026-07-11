# design.md — crm-tenant-keys-freeform

## 1. Regex de validación de nombre (compartida back)
Nueva constante en `back/src/lib/tenant-secrets/catalog.ts`:
```ts
export const ENV_KEY_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export function inferScope(name: string): 'FRONTEND_PUBLIC' | 'BACKEND_SECRET' {
  return name.startsWith('NEXT_PUBLIC_') ? 'FRONTEND_PUBLIC' : 'BACKEND_SECRET';
}
```
Reutiliza el prefijo de `back/src/lib/export-builders/public-env-secrets.ts`
(`/^NEXT_PUBLIC_[A-Z0-9_]+$/`, ya existente) para el caso `FRONTEND_PUBLIC`, generalizado a
cualquier prefijo para `BACKEND_SECRET`.

## 2. `back/src/routes/tenant-keys.ts`

### `upsertSecretHandler`
```
const slot = findSecretSlot(req.params.name);   // preset conocido (comportamiento actual intacto)
let scope, envVarName, label;
if (slot) {
  scope = slot.scope; envVarName = slot.envVarName ?? null; label = slot.label;
} else {
  const name = req.params.name;
  if (!ENV_KEY_NAME_PATTERN.test(name)) return 422 'invalid_name';
  if (BASE_ENV_VAR_NAMES.includes(name)) return 422 'reserved_name';  // import desde public-env-secrets.ts
  scope = inferScope(name);
  envVarName = scope === 'FRONTEND_PUBLIC' ? name : null;
  label = name;
}
```
Resto del handler (cifrado, upsert, respuesta) sin cambios — solo cambia el origen de
`scope`/`envVarName`/`label`.

`BASE_ENV_VAR_NAMES` se exporta desde `public-env-secrets.ts` (hoy interno) para no duplicar la
lista de 2 nombres reservados en dos sitios.

### `listSecretsHandler`
Cambia el `where` de `{ businessId, name: { in: CATALOG_NAMES } }` a `{ businessId }` (trae TODO
lo del tenant, no solo catálogo). Construcción de la respuesta:
```
const presetRows = TENANT_SECRET_CATALOG.map(slot => ({ ...slot meta..., configured: byName.has(slot.name) }));
const extraRows = rows.filter(r => !CATALOG_NAMES.includes(r.name))
  .map(r => ({ name: r.name, label: r.name, scope: r.scope, envVarName: r.envVarName, configured: true, updatedAt: r.updatedAt }));
res.json({ secrets: [...presetRows, ...extraRows] });
```

### `deleteSecretHandler` / `testSecretHandler`
Quitan el `if (!slot) return 404 unknown_secret` como bloqueo total. Nuevo comportamiento:
- `delete`: opera sobre cualquier `name` existente en BD para ese `businessId` (el 404 ya
  existente por "no encontrado" cubre el caso de nombre inventado sin fila).
- `test`: si `findSecretSlot(name)` no existe (sin `provider` conocido) → `400 { code:
  'not_testable', message: 'Esta variable no tiene prueba de conexión disponible' }` ANTES de
  tocar rate-limit/BD.

## 3. Front — `front/lib/api/tenant-keys.ts`
```ts
export type TenantSecretName = string;               // era union cerrada de 5
export const KNOWN_PRESET_NAMES = ['OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_MAPS_API_KEY','DATABASE_URL'] as const;

export interface TenantSecretSlot {
  name: string;
  label: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  envVarName: string | null;
  configured: boolean;
  updatedAt: string | null;
}
```
`upsertSecret`/`deleteSecret`/`testSecret` cambian el tipo del parámetro `name` de
`TenantSecretName` (unión) a `string` — mismo cuerpo, sin cambios de runtime.

## 4. Front — `front/components/config/tenant-keys-panel.tsx`
- `CATALOG` local (5 tarjetas) se mantiene igual, sigue leyendo `secrets` filtrando por
  `KNOWN_PRESET_NAMES` para hidratar `configured`/`updatedAt` como hoy.
- Nueva sub-sección `<OtherVarsSection businessId secrets />` debajo de las tarjetas de preset:
  - `rows` = `secrets.filter(s => !KNOWN_PRESET_NAMES.includes(s.name))` + 1 fila local en blanco
    al final (`draft: { key: '', value: '' }`) que nunca se persiste hasta pulsar "Agregar".
  - Cada fila persistida: input `key` deshabilitado (nombre no editable tras creado, solo
    value/Quitar) + botón "Quitar" (`deleteSecret`).
  - Fila en blanco: input `key` (validación en vivo con `ENV_KEY_NAME_PATTERN` client-side,
    mismo regex duplicado en front — sin importar back en el bundle) + input `value`
    (password-masked) + botón "Agregar" (disabled hasta que `key` sea válido y `value` no vacío).
    Al pulsar: `upsertSecret(businessId, key, value)` → en éxito, limpia la fila draft y refresca
    `secrets` (nueva fila pasa a la lista persistida, aparece otra fila en blanco).
  - Debajo del input `key`, texto pequeño reactivo: `key.startsWith('NEXT_PUBLIC_') ? 'Pública — va
    al bundle del export' : 'Secreta — solo backend'`.

## 5. Fuera de cambio (verificado, sin tocar)
- `back/src/lib/export-builders/public-env-secrets.ts` — ya lee cualquier fila
  `scope: FRONTEND_PUBLIC, envVarName != null` vía `readBakeableSecrets`, sin filtrar por catálogo.
  Una vez el tenant guarda `NEXT_PUBLIC_SUPABASE_ANON_KEY` free-form, se hornea sola en el próximo
  export.
- `back/src/routes/service-operator-tenant-keys.ts` — ya es free-form (acepta `name`/`scope`
  arbitrarios desde el bot), no requiere cambios.
- Modelo Prisma `TenantSecret` — sin migración.

## 6. Riesgo de nombre reservado — verificación cruzada
`BASE_ENV_VAR_NAMES` (public-env-secrets.ts) hoy = `['NEXT_PUBLIC_TENANT_JSON',
'NEXT_PUBLIC_API_URL']`. Si en el futuro `manifest-allowlist.ts` añade una 3ª var base, debe
añadirse ahí — el bloqueo en `upsertSecretHandler` la hereda automáticamente al importar la misma
constante (no se duplica la lista).
