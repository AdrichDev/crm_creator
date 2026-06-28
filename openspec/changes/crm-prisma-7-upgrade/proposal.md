# Proposal — Upgrade Prisma 5 → 7 en CRM back (crm-prisma-7-upgrade)

**Nivel Gru: 3 — Grande (roza 4).** Dos majors de ORM, repunte de imports en 13 sitios, regeneración
de cliente, toca capa de datos de toda la app + migraciones. Irreversible-ish (install), requiere
aprobación humana.
**Estado: PENDIENTE APROBACIÓN — F2 del plan de alineación de versiones (#7).**

## Contexto

CRM back está en Prisma 5.22; AA back ya en Prisma 7.8. Para alinear, CRM sube 5→7.
Estado actual CRM back:
- `generator client { provider = "prisma-client-js" }` (generador legacy, sin output explícito → default `node_modules/@prisma/client`).
- 13 imports desde `@prisma/client` (PrismaClient, `Prisma` namespace, enums BookingStatus/MemberRole).
- ESM (`"type": "module"`), sin `prisma.config.ts`, config Prisma en `package.json`.

Referencia (AA back, P7): `generator client { provider = "prisma-client", output = "../src/lib/generated/prisma" }`,
imports desde el cliente generado.

## Breaking changes a resolver (P6 + P7)

1. Prisma 7 elimina `prisma-client-js`: cambiar a `provider = "prisma-client"` + `output` explícito
   (alinear con AA: `output = "../src/lib/generated/prisma"`).
2. Repuntar los 13 imports `@prisma/client` → ruta del cliente generado (alias `@/...` o relativo).
3. Config Prisma fuera de `package.json` → `prisma.config.ts` (P7).
4. Regenerar cliente (gotcha EPERM Windows: server back PARADO antes de `prisma generate`; ver
   crm-prisma-migration-gotcha; NO usar `--no-engine`).
5. Revisar APIs con cambios de comportamiento P6/P7 (p.ej. tipos JSON, `$queryRaw` typing, removed
   deprecations). Validar con typecheck + suite + e2e contra DB real.

## Decisiones técnicas

- Alinear al patrón de AA (generador `prisma-client` + carpeta generada en `src/lib/generated/prisma`).
- Subida directa a `@^7` (Prisma soporta saltar de 5 a 7 si el schema es compatible); si la
  regeneración o las migraciones fallan, escalón intermedio por 6.
- NO tocar el SQL de negocio salvo que un breaking lo exija.

## Alcance

1. `package.json`: `prisma` y `@prisma/client` → `^7.x`.
2. `prisma/schema.prisma`: generator `prisma-client` + output.
3. `prisma.config.ts` nuevo (datasource/migrations).
4. Repunte de 13 imports.
5. Regeneración de cliente + verificación.

## Fuera de alcance

- F3 (Next 14→15) y F4 (React 18→19) en AA front — fases separadas.
- Cambios funcionales/SQL no forzados por el upgrade.

## Riesgos

- Breaking runtime que typecheck no pilla → mitigar con suite + e2e contra DB real (server arrancado).
- EPERM en `prisma generate` (Windows) → parar server antes.
- Migraciones existentes: `prisma migrate` en P7 puede exigir `prisma.config.ts` correcto. Validar
  `migrate status` sin aplicar nada nuevo.
- Rollback: revertir package.json + schema + imports + regen P5 si algo crítico rompe.
