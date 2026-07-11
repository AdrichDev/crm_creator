# tasks.md — crm-tenant-keys-freeform

Orden crítico: back primero (endpoints + tests verdes) → front después (consume contrato ya
estable) → smoke manual export.

- [x] **T1. `catalog.ts`**: añadir `ENV_KEY_NAME_PATTERN`, `inferScope()`. Test unitario
      (`catalog.test.ts`): casos `NEXT_PUBLIC_X` → FRONTEND_PUBLIC, `X` → BACKEND_SECRET, nombre
      inválido (minúscula/espacio/empieza por dígito) → regex no matchea.
- [x] **T2. `public-env-secrets.ts`**: `BASE_ENV_VAR_NAMES` ya estaba `export const` (línea 26) —
      nada que hacer, verificado directamente.
- [x] **T3. `tenant-keys.ts` — `upsertSecretHandler`**: rama free-form cuando `findSecretSlot`
      devuelve `undefined` (validar nombre, rechazar colisión con `BASE_ENV_VAR_NAMES`, inferir
      scope/envVarName/label). Tests verdes en `tenant-keys.route.test.ts` (PUT NEXT_PUBLIC_*,
      PUT BACKEND_SECRET, 422 invalid_name x3, 422 reserved_name x2, preset regresión intacta).
- [x] **T4. `listSecretsHandler`**: `where` sin filtro de catálogo; merge preset+extra en
      respuesta. Test verde: 1 preset configurado + 1 free-form → ambos en `secrets` con
      `scope`/`envVarName` correctos, sin leak de value.
- [x] **T5. `deleteSecretHandler`**: quitar gate `findSecretSlot`; opera sobre cualquier `name`
      existente. Test verde: alta+borrado free-form → 200, desaparece de un GET posterior.
- [x] **T6. `testSecretHandler`**: 400 `not_testable` si `findSecretSlot` no matchea, antes de
      tocar rate-limit. Test verde: POST `/secrets/STRIPE_SECRET_KEY/test` → 400, 0 llamadas a
      `testProviderConnection` (contador real, no solo mock).
- [x] **T7. `front/lib/api/tenant-keys.ts`**: `TenantSecretName = string`, `KNOWN_PRESET_NAMES`,
      `TenantSecretSlot` con `label`/`scope`/`envVarName`. Sin test dedicado (tipos), verificado
      por `tsc` limpio.
- [x] **T8. `tenant-keys-panel.tsx` — sección "Otras variables"**: filas dinámicas + fila draft +
      validación en vivo + preview de scope. Tests verdes (`tenant-keys-panel.test.tsx`): key
      inválida deja "Agregar" disabled; `NEXT_PUBLIC_FOO` + value + click Agregar llama
      `upsertSecret(businessId, 'NEXT_PUBLIC_FOO', value)` y la fila pasa a persistida; click
      Quitar en fila existente llama `deleteSecret`.
- [ ] **T9. Smoke manual (usuario)**: en "Comercial Demo IA", añadir
      `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` vía el panel nuevo, exportar de
      nuevo la app, confirmar que YA NO aparece "Supabase no configurado" y el login funciona.

## Verificación final
- [x] `back`: `tsc` limpio + suite completa verde (872/872, incluye T1/T3/T4/T5/T6).
- [x] `front`: `tsc` limpio + suite verde (751/751, incluye T8).
- [ ] `sdd-verify` o `/code-review` antes de commit (memoria: verificación siempre antes de
      commitear, no solo tsc/tests manuales).
- [ ] T9 verificado por el usuario (no automatizable — depende de credenciales reales de Supabase
      del tenant).
