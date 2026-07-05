# Tasks — crm-prisma-7-upgrade  (Nivel 3 — PENDIENTE APROBACIÓN HUMANA)

> Migración major (5→7) con cambios de código. Aprobación humana requerida ANTES de ejecutar.

## Aprobaciones
- [x] AP.1 Humano aprobó ejecutar el upgrade (alineado a AA). (2026-06-28)
- [x] AP.2 Server :4001 parado antes de generate.

## Fase A — Deps + generator
- [x] A.1 `package.json`: `prisma`+`@prisma/client` → `^7.8.0` (+ `@prisma/adapter-pg@^7.8.0`). `npm install --ignore-scripts`.
- [x] A.2 `prisma/schema.prisma`: generator `prisma-client` + output; `datasource.url` ELIMINADA (P7 la prohíbe en schema).
- [x] A.3 `prisma.config.ts` nuevo (schema + migrations + datasource url env).

## Fase B — Repunte de imports (13 sitios)
- [x] B.1 `src/prisma.ts`: PrismaClient del cliente generado + `PrismaPg({...},{schema:'crm'})` adapter (Proxy lazy, patrón AA).
- [x] B.1b 12 imports más → `../**/generated/prisma/client.js` relativo (.js, ESM/tsx). 3 e2e: usan el singleton `prisma` (no `new PrismaClient()`, P7 exige adapter).
- [x] B.2 `npx tsc --noEmit` limpio.

## Fase C — Regeneración + migraciones
- [x] C.1 `prisma generate` engine-ful OK → `src/lib/generated/prisma` (client.ts/enums.ts/models.ts).
- [x] C.2 `prisma migrate status` → "Database schema is up to date!" (schema crm, 8 migraciones).

## Fase D — Verificación
- [x] D.1 `npm test` (con `--env-file=.env`) CRM back verde — **109 pass / 0 fail / 0 skip** (unit + e2e live Supabase). Adapter+cliente generado validados contra DB real.

## Tras verde: gate Agentic Runtime ANTES de cualquier commit/push.
- [x] Agentic Runtime PASS (2026-06-28). Hallazgos resueltos:
      - 🔴 "$disconnect del singleton rompe e2e" = FALSO POSITIVO: `node --test` aísla cada fichero
        en su propio proceso (cada e2e tiene su singleton). Evidencia: 109/0/0 con los 3 e2e.
      - 🟡 cross-schema raw (aa.tenant) = cerrado con smoke P7: modelo crm.user (6) + raw aa.tenant (11)
        + raw crm.notificacion (0) ejecutan. Nombre cualificado gana sobre search_path.
      - 🟡 P2002 con adapter, env timing, pooling :5432 = evidencia (suite verde) + idéntico a AA en prod.

## Rollback
- Si rompe crítico: revertir package.json + schema + imports + `prisma generate` P5.
