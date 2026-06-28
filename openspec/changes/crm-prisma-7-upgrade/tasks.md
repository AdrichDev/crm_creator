# Tasks — crm-prisma-7-upgrade  (Nivel 3 — PENDIENTE APROBACIÓN HUMANA)

> Migración major (5→7) con cambios de código. Aprobación humana requerida ANTES de ejecutar.

## Aprobaciones
- [ ] AP.1 Humano aprueba ejecutar el upgrade (install + repunte de imports + regen).
- [ ] AP.2 Humano confirma parar el server back :4001 antes de `prisma generate` (EPERM).

## Fase A — Deps + generator
- [ ] A.1 `package.json`: `prisma`+`@prisma/client` → `^7.x`. `npm install`.
- [ ] A.2 `prisma/schema.prisma`: generator `prisma-client` + `output = "../src/lib/generated/prisma"`.
- [ ] A.3 `prisma.config.ts` nuevo (datasource url env + migrations dir).

## Fase B — Repunte de imports (13 sitios)
- [ ] B.1 `src/prisma.ts` y 12 más: `@prisma/client` → cliente generado.
- [ ] B.2 `npx tsc --noEmit` limpio.

## Fase C — Regeneración + migraciones
- [ ] C.1 Parar server :4001. `prisma generate` engine-ful (NO --no-engine). Verificar output.
- [ ] C.2 `prisma migrate status` → up to date (no aplicar nuevas).

## Fase D — Verificación
- [ ] D.1 Arrancar server. `npm test` (CRM back) verde — 109 pass (unit + e2e DB real).
- [ ] D.2 Smoke manual de un endpoint clave si hace falta.

## Tras verde: gate Ruflo ANTES de cualquier commit/push.
- [ ] Ruflo PASS.

## Rollback
- [ ] Si rompe crítico: revertir package.json + schema + imports + `prisma generate` P5.
