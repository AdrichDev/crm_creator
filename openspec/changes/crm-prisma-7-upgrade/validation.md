# Validación — crm-prisma-7-upgrade

Historia: como CRM con un stack alineado, quiero el back en Prisma 7 (igual que AA) sin perder
funcionalidad de datos ni romper migraciones.

## Criterios de aceptación (AC)

- **AC1**: `@prisma/client` y `prisma` en `^7.x`; generator `prisma-client` con `output` explícito.
- **AC2**: Los 13 imports repuntan al cliente generado; no queda import desde `@prisma/client`.
- **AC3**: `prisma generate` (engine-ful) OK; cliente generado en `src/lib/generated/prisma`.
- **AC4**: `prisma migrate status` reporta "up to date" (sin aplicar migraciones nuevas).
- **AC5**: `npx tsc --noEmit` limpio.
- **AC6**: CRM back suite verde (109 pass), e2e con DB real incluidos (server arrancado).
- **AC7**: Sin cambios de comportamiento de negocio (mismos endpoints, mismos resultados).

## Por tarea (Given-When-Then + test)

### T.1 — deps + generator
- **Given** package.json en ^7, schema con generator nuevo, **When** `prisma generate`, **Then** cliente
  generado sin error. _Test: comando + ls del output._

### T.2 — repunte imports
- **Given** 13 sitios, **When** repuntados al cliente generado, **Then** tsc limpio. _Test: tsc._

### T.3 — migraciones
- **Given** prisma.config.ts + DATABASE_URL, **When** `migrate status`, **Then** up to date. _Test: comando._

### T.4 — regresión funcional
- **Given** server arrancado contra DB real, **When** suite CRM back (unit + e2e), **Then** 109 verde.
  _Test: node:test + e2e._

## Verificación
- [ ] tsc limpio · suite verde · migrate status up-to-date · generate OK.
