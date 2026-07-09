# Tareas — crm-env-contract-tiers

Nivel 3. Migración 1 (aditiva, tras la de `crm-tenant-api-keys`). Orden = contrato
documentado (sin dependencias) → helper back → puente build-time. WU2/WU3 bloqueados
hasta que aterricen `crm-tenant-api-keys` (almacén) y `crm-export-clean-manifest`
(`buildEnvContent`). Agentic Runtime gate antes de cualquier push.

## WU1 — Contrato documentado (sin dependencias)
- [x] 1.1 Inventario de variables: auditar `process.env.*` en `front/` y `back/src/env.ts` (fuente del contrato).
- [x] 1.2 `docs/ENV-CONTRACT.md`: tabla tiers 1/2/3 + reglas R1-R4 (backend nunca sale, tier 2 instancia aislada, horneado = público con referrer, fallback medible).
- [x] 1.3 `front/.env.example` regenerado: contrato completo por bloques, placeholder + comentario por variable, incluida `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; cero valores reales.
- [x] 1.4 Test/script `env-example.contract.test.ts`: toda variable consumida en `front/` está documentada en `.env.example`.

## WU2 — Resolución `BACKEND_SECRET` por negocio (requiere crm-tenant-api-keys)
- [x] 2.1 `getTenantSecret(businessId, name, { fallbackEnv })` en `back/src/lib/tenant-secrets/store.ts` (devuelve `{ value, source: 'tenant' | 'operator' } | null`; valor solo en memoria, nunca en logs).
- [x] 2.2 Adopción de referencia: `back/src/routes/branding.ts` resuelve la clave IA vía `getTenantSecret` con fallback a `ANTHROPIC_API_KEY` (comportamiento actual intacto sin secreto de negocio).
- [x] 2.3 Tests `tenant-secrets.store.test.ts` (tenant/operator/null) + extensión `branding.route.test.ts` (clave propia vs fallback).

## WU3 — Puente build-time (requiere crm-tenant-api-keys + crm-export-clean-manifest)
- [x] 3.1 Columna `envVarName @map("env_var")` en `TenantSecret` (`schema.prisma`) + migración `<ts>_tenant_secret_env_var` (ADD COLUMN, sin DROP). ⚠️ PENDIENTE APLICAR por usuario, después de la de `crm-tenant-api-keys`.
- [x] 3.2 Validación en alta de secreto de operador: `envVarName` solo con `FRONTEND_PUBLIC`, regex `^NEXT_PUBLIC_[A-Z0-9_]+$`, rechazo de valores con saltos de línea.
- [x] 3.3 Extensión `buildEnvContent(config, publicEnvSecrets?)`: hornea `FRONTEND_PUBLIC` con `envVarName` como líneas `NEXT_PUBLIC_*`; re-valida regex y `\n`; colisión con variable base → gana la base + warning. SIN segundo escritor de `.env.local`.
- [x] 3.4 Resolución en el job de export: `readBakeableSecrets(businessId)` (ya filtrado a scope=FRONTEND_PUBLIC + `envVarName != null` en la query), descifrado, pasado a los 4 builders.
- [x] 3.5 Tests `secrets.operator.envvar.test.ts` + `build-env-content.test.ts` (línea presente, backend excluido, sin pisar base, sin envVarName no se hornea).

## Cierre
- [x] Z.1 back suite verde + `tsc` limpio (+ tests nuevos). 744/744 pass, tsc limpio.
- [ ] Z.2 Agentic Runtime review (foco: BACKEND_SECRET horneado por error, inyección de líneas en `.env.local`, valores reales en `.env.example`). PENDIENTE — paso de revisión posterior, fuera del alcance de sdd-apply.
- [ ] Z.3 Migración APLICADA a Supabase + `prisma migrate status` sin drift. PENDIENTE — responsabilidad del usuario (gotcha explícito: no ejecutar migrate deploy/db push).
- [x] Z.4 Engram persistido + ESTRUCTURA.md actualizado. Engram: sdd/crm-env-contract-tiers/apply-progress.

## Verificaciones finales
- [ ] Un export real de un negocio con clave de mapas `FRONTEND_PUBLIC` arranca con mapas funcionando (loader no lanza); el mismo export nunca contiene ningún `BACKEND_SECRET`. PENDIENTE — requiere migración aplicada + export real end-to-end, fuera del alcance de sdd-apply.
- [ ] `front/.env.example` del ZIP entregado no contiene ningún valor real, ni siquiera del tenant exportado. Cubierto por diseño (buildEnvExampleContent nunca recibe publicEnvSecrets, solo buildEnvContent los hornea) pero sin verificación end-to-end de un ZIP real.
- [x] `.env.local` generado sale de un único escritor (`buildEnvContent`); `grep` de escritores alternativos limpio. Verificado: único `fs.writeFileSync(...'.env.local'...)` es `writeFreshEnvLocal` en `manifest-allowlist.ts:230`.
