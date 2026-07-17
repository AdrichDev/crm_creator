# Validation — crm-central-oauth-admin-config

## User story

Como admin de la plataforma, quiero configurar las credenciales de la app Google
central desde un panel de admin (guardadas cifradas en BD), igual que se meten otras
APIs, para no depender del env de Render; y que la resolución sea tenant → plataforma
→ env, sin romper nada.

## Acceptance criteria

- **AC1**: `getPlatformSecret(name, {fallbackEnv})` devuelve el valor de plataforma
  (BD, cifrado) si existe; si no, el env. Cifrado AES-256-GCM.
- **AC2**: la resolución de creds Google es **tenant → plataforma → env**; par-o-nada
  por nivel (nunca mezcla id de un nivel con secret de otro).
- **AC3**: sin config de plataforma en BD → se usa el env → comportamiento **idéntico**
  al deploy actual (regresión cero).
- **AC4**: la API admin-plataforma (`/api/platform/oauth-config`) está gated por
  operator/plataforma; un admin de tenant NO la alcanza (401/403). Upsert cifra; el
  estado no devuelve el secret; el test no fuga el value; rate-limit en test.
- **AC5**: las 3 claves de plataforma son server-side y NO aparecen en ningún export.
- **AC6**: el front admin permite meter/probar las 3 creds con nota "vacío = env legacy".

## Given-When-Then

**Escenario 1 (AC2): config en plataforma, tenant sin creds**
Given `GOOGLE_OAUTH_*` guardado a nivel plataforma (BD) y un tenant sin creds propias
When el tenant conecta Google Calendar
Then se usan las creds de plataforma (BD), no el env.

**Escenario 2 (AC3 regresión): sin config en BD**
Given ni tenant ni plataforma tienen creds en BD
When se resuelve la config OAuth
Then se usan las del env (comportamiento idéntico al actual).

**Escenario 3 (AC4 gate): admin de tenant no alcanza el endpoint plataforma**
Given un usuario admin de un tenant (sin operator token)
When llama `PUT /api/platform/oauth-config`
Then recibe 401/403 y nada se escribe.

## Test por tarea
- T1 → getPlatformSecret cifra/descifra/fallback.
- T2 → 3 ramas tenant/plataforma/env + incompleto.
- T3 → gate operator, upsert cifrado, test sin fuga.
- T5 → no-export + regresión env.

Regla del repo: DONE solo con test verde; sin spec, revertido.
