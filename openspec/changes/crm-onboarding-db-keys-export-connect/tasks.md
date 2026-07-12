# Tasks: BD en onboarding + export conecta

Orden: back primero (catálogo/provider/gate) → front (consume tipos) → verify.

- [x] **T2 — Catálogo: slots Supabase (back)**
  - `catalog.ts`: extender `SecretSlotName` + `SecretProvider('supabase')`; añadir 2 slots
    FRONTEND_PUBLIC group database.
  - **Test**: `findSecretSlot` de ambos → scope/envVarName/group correctos. VERDE.

- [x] **T3 — provider-test: case 'supabase' (back)**
  - Validación de formato local (url https / jwt-ish), sin red, sin filtrar value.
  - **Test**: url válida → ok; formato inválido → ok:false sin value en detail. VERDE.

- [x] **T4 — Gate de export fail-closed (back)**
  - `exports.ts`: antes de `startJob`, 422 `export_missing_db_config` si falta api.url /
    supabase url / anon.
  - **Test**: falta alguna → 422 con `missing`; las 3 presentes → 202. VERDE.

- [x] **T1 — Probar Maps por `/test` (front)** — ⚠️ CORREGIDO en code-review (ver T1b).
  - `tenant-keys-panel.tsx`: quitar rama especial maps en `probar`; todos usan `testSecret`.
  - **Test**: `probar('GOOGLE_MAPS_API_KEY','maps')` llama `testSecret`, no `/tenant-config`.
    VERDE.

- [x] **T1b — Fix code-review: Probar Maps NO usa `/test` (front)**
  - T1 fue un ERROR: el back geocodifica la maps key server-side; una key NEXT_PUBLIC
    correctamente restringida por HTTP-referrer devuelve `REQUEST_DENIED` sin referer →
    marcaba en rojo una key VÁLIDA.
  - `tenant-keys-panel.tsx`: `probar(name, kind==='maps')` ya NO llama `testSecret` ni
    `/tenant-config`; verifica `slots.find(s=>s.name===name)?.configured` (sin edición
    pendiente sin guardar) — sin red. El resto de kinds (ai/database/supabase) siguen
    usando `testSecret`.
  - `tenant-keys.ts`: `TenantSecretTestResult.provider` ya incluía `'supabase'` (no
    `'supabase_url'`/`'supabase_anon'` — el back (catalog.ts/provider-test.ts) usa un único
    provider `'supabase'` para ambos slots; verificado en código, sin cambio necesario).
  - **Test**: maps configurado sin edición pendiente → mensaje éxito sin llamar a
    `/test` ni `/tenant-config`; maps con edición pendiente sin guardar → pide guardar
    primero, sin red. VERDE (19/19 tenant-keys-panel + 772/772 suite front).

- [x] **T5 — Front: presets + CATALOG Supabase**
  - `tenant-keys.ts`: `KNOWN_PRESET_NAMES` += 2; `TestResult.provider` += 'supabase'.
  - `tenant-keys-panel.tsx`: `CATALOG` += 2 (group database, kind supabase) + placeholder.
  - **Test**: los 2 nombres NO caen en `extraSecrets`. VERDE.

- [x] **T6 — Verificación final**
  - `tsc --noEmit` back y front verde.
  - Suites afectadas verdes (catalog, provider-test, exports, tenant-keys panel/route).
  - `/code-review` antes de commit.
  - Smoke: onboarding paso BD muestra los 2 campos Supabase; export sin ellos → 422.
