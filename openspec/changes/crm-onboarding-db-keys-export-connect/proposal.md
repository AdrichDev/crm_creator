# Proposal: BD del artefacto configurable en onboarding + export conecta a la BD

## Intent
Reporte del usuario (12/07/2026): (1) al guardar Google Maps en el onboarding "da
problemas"; (2) tras meter Supabase URL + anon key, el CRM exportado no conecta a la BD.

Diagnóstico (verificado en código):
- **Maps**: el guardado funciona; lo que falla es el **"Probar"**. Maps se verifica vía
  `apiFetch('/tenant-config')` (`tenant-keys-panel.tsx:116-127`), que manda
  `x-business-id` = negocio **ACTIVO** de la sesión (`client.ts:63-64`, pisa cualquier
  override), no el `businessId` del negocio editado. Si editas un negocio ≠ activo →
  falso negativo "La clave aún no se refleja en el front. Guarda primero".
- **Export sin BD**: el artefacto autentica contra Supabase (login → access_token) y
  consume datos vía backend (`NEXT_PUBLIC_API_URL`). El pipeline hornea automáticamente
  todo `TenantSecret` `FRONTEND_PUBLIC` con `envVarName` (`store.ts:155-171` →
  `public-env-secrets.ts:40-61`), PERO el catálogo (`catalog.ts:27-40`) solo define un
  slot público: Google Maps. **Supabase no tiene slots dedicados** → hoy hay que meterlas
  a mano en "Otras variables" con el nombre EXACTO y prefijo `NEXT_PUBLIC_`. Si falta el
  prefijo o el nombre no es exacto → no se hornea → sin login → 401 → "no conecta".

## Premisa (usuario, 12/07/2026)
En el **onboarding** SIEMPRE se configura la BD con la que trabajará el CRM, sea la
Supabase de plataforma (la nuestra) o una externa. **No hay inyección automática de
plataforma**: es siempre explícito. Aplica a TODO CRM creado (universal), no solo al de
pruebas "comercial Demo IA".

## Scope

### Frente 1 — "Probar" de Maps (scoping)
Unificar el "Probar" de Maps al endpoint real `POST /tenant-keys/:businessId/secrets/
:name/test` (usa el `businessId` del path → correcto; prueba la clave contra Google).
Elimina el caso especial `/tenant-config`.

### Frente 2 — BD en onboarding + hornear al export
1. Añadir al catálogo dos slots `FRONTEND_PUBLIC` (group `database`):
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (envVarName = mismo nombre).
   Aparecen como campos dedicados en la card "Base de datos" del paso 3 del onboarding.
2. El export ya hornea `FRONTEND_PUBLIC` con `envVarName` → al ser slots de catálogo,
   entran solos en el `.env.local` del artefacto cuando el operador los rellena.
3. **Gate de export (fail-closed)**: si al exportar faltan `config.api.url`,
   `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_ANON_KEY`, el export responde
   **422 `export_missing_db_config`** con mensaje claro, en vez de generar un artefacto
   muerto. (Hoy es fail-open: `exports.ts:428-442`.)

## Out of Scope
- Inyección automática de creds de plataforma / tocar env de Render.
- Routing multi-BD del BACKEND por tenant (el slot `DATABASE_URL` backend queda como está);
  el artefacto usa el backend de plataforma vía `api.url`. Deuda aparte.

## Risks
- El gate de export bloquea negocios que hoy no tienen las 3 vars (incluido Demo IA hasta
  configurarlas). Es el comportamiento deseado (evita artefacto que no conecta).
- Añadir slots al catálogo cambia la card "Base de datos" (más campos). Sin migración.
