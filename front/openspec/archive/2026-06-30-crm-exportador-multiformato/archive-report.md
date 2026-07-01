# Archive Report — crm-exportador-multiformato

**Archived**: 2026-06-30
**Level**: 3 — Large
**Status**: CLOSED

## Summary

Exportador multi-plataforma + rediseño Dashboard. Añade `POST /api/exports` con streaming
NDJSON, builders para web-zip/exe/apk/ipa, código compartido en `shared/generate/`, y
rediseño de `/dashboard` con dos pestañas (Dashboard paginado + Exportar con progreso en
tiempo real).

## Engram Observation IDs

| Artifact | ID |
|----------|----|
| spec | #513 |
| tasks | #514 |
| apply-progress | #515 |
| verify-report | #516 |
| archive-report | #517 (este) |

## Commits

| Hash | WU | Descripción |
|------|----|-------------|
| 27514a9 | WU-1 | shared foundation + back infra |
| 1873473 | WU-2 | back builders + endpoint POST /api/exports |
| 383df45 | WU-3 | front UI — dashboard pestañas + exportador |
| 12702d5 | WU-4 | unit tests export-lock/preflight/ipa |

## Files Added (nuevos)

### shared/
- `shared/generate/tenant-types.ts`
- `shared/generate/build-sql.ts`
- `shared/generate/build-prisma.ts`
- `shared/generate/build-manifest.ts`

### back/
- `back/src/lib/export-lock.ts`
- `back/src/lib/export-preflight.ts`
- `back/src/lib/export-temp-copy.ts`
- `back/src/lib/export-builders/web-zip.ts`
- `back/src/lib/export-builders/exe.ts`
- `back/src/lib/export-builders/apk.ts`
- `back/src/lib/export-builders/ipa.ts`
- `back/src/routes/exports.ts`
- `back/src/lib/__tests__/export-lock.test.ts`
- `back/src/lib/__tests__/export-preflight.test.ts`
- `back/src/lib/__tests__/export-builders-ipa.test.ts`
- `back/.gitignore`

### front/
- `front/lib/export/use-export-stream.ts`
- `front/components/dashboard/export-progress.tsx`
- `front/components/dashboard/export-table.tsx`
- `front/components/dashboard/dashboard-tabs.tsx`

## Files Modified

- `front/lib/generate/build.ts` — re-exports shared/generate/
- `front/lib/config/tenant-config.ts` — BAKED_TENANT_CONFIG
- `front/app/dashboard/page.tsx` — DashboardTabs, sin botón Generar
- `back/src/routes/index.ts` — register /exports
- `back/package.json` — engines node>=20.3, jszip dep

## Verification

- 15/15 RF: ✓
- 7/7 RNF: ✓
- Tests: 11/11 passing
- TSC: 0 errores (back + front)
- 6.4 omitido por diseño (requiere DB viva)
- 6.6 smoke manual: pendiente usuario

## Decisiones arquitectónicas preservadas

1. **NDJSON sobre EventSource**: POST + fetch ReadableStream en lugar de GET+SSE; permite auth Bearer.
2. **Temp copy strategy**: `fs.cpSync front/ → back/tmp/build-<uuid>/`, inject env var, rm -rf en finally — nunca toca front/src/ original.
3. **Build lock**: boolean simple + 20-min watchdog + release en finally.
4. **shared/generate/**: código puro sin deps browser, importado via relative path por front y back (sin monorepo setup).
5. **ipa guard**: format-error inmediato en non-darwin, sin proceso, sin crash.
