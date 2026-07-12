# Validation: BD en onboarding + export conecta

## User Story
Como operador que configura un CRM en el onboarding, quiero introducir las credenciales
de la BD (Supabase URL + anon key) en campos dedicados y que el CRM exportado conecte a
esa BD, sea la de plataforma o una externa.

## Acceptance Criteria
- **AC1** — El "Probar" de Google Maps usa el endpoint `/test` con el `businessId` del
  negocio editado (no el activo) → sin falsos negativos por scoping.
- **AC2** — La card "Base de datos" del onboarding muestra campos dedicados para
  `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (guardar + probar).
- **AC3** — Guardadas esas vars, el `.env.local` del export las incluye (se hornean por
  ser `FRONTEND_PUBLIC` con `envVarName`).
- **AC4** — Si al exportar falta `config.api.url`, `NEXT_PUBLIC_SUPABASE_URL` o
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, el export responde 422 `export_missing_db_config` con
  la lista de lo que falta, y NO arranca el job.
- **AC5** — Las dos vars de Supabase NO aparecen en "Otras variables" (son slots de
  catálogo, no freeform).

## Scenarios (Given-When-Then)

### S1 — Probar Maps en negocio editado ≠ activo (AC1)
- **Given** onboarding en `?projectId=X` con X ≠ negocio activo, Maps guardada en X
- **When** el operador pulsa "Probar" en Google Maps
- **Then** se llama `POST /tenant-keys/X/secrets/GOOGLE_MAPS_API_KEY/test` y el resultado
  refleja la clave de X (no un falso negativo del negocio activo)

### S2 — Export sin Supabase se bloquea (AC4)
- **Given** un negocio con `api.url` seteado pero sin `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **When** se hace `POST /exports` para ese negocio
- **Then** responde 422 `export_missing_db_config` con `missing` incluyendo
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`; no se crea job

### S3 — Export con BD completa hornea las vars (AC3)
- **Given** un negocio con `api.url`, `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` guardadas
- **When** se resuelven los `publicEnvSecrets` del export
- **Then** ambas variables están en la lista a hornear

## Tests (uno por tarea)
- **T1** (front Maps): `probar('GOOGLE_MAPS_API_KEY','maps')` llama `testSecret` (no
  `/tenant-config`). VERDE.
- **T2** (back catálogo): `findSecretSlot('NEXT_PUBLIC_SUPABASE_URL')` y `_ANON_KEY`
  devuelven slot `FRONTEND_PUBLIC`, `group='database'`, `envVarName` = mismo nombre. VERDE.
- **T3** (back provider-test): `testProviderConnection('supabase', <url válida>)` → ok;
  valor con formato inválido → `ok:false` sin filtrar el value. VERDE.
- **T4** (back export gate): export sin supabase/api.url → 422 `export_missing_db_config`;
  con las 3 → arranca job (202). VERDE.
- **T5** (front presets): los 2 nombres Supabase NO caen en `extraSecrets` ("Otras
  variables"). VERDE.

## Done
Cada tarea DONE solo con su test verde. Sin spec = cambios revertidos.
