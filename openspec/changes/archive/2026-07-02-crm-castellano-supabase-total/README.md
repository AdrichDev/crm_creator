# ARCHIVO — crm-castellano-supabase-total

**Cerrado:** 2026-07-02  
**Nivel:** 3 — Large  
**Estado:** COMPLETADO  

Este change fue archivado según el protocolo SDD. Contiene la propuesta, validación, diseño, tareas y especificaciones del cambio histórico.

El trabajo se completó según `tasks.md` (ESTADO FINAL 2026-06-25):
- P.0-P.8: Consola + datos castellano 9 módulos sobre Supabase (Business = tenant)
- O.1-O.4: Operaciones core (CRUD castellano, soft-delete, row-level)
- H.1-H.8: Hardening seguridad (FK gate, auth única, env fail-closed)
- Fase 4: Purga localStorage (lib/supabase/client.ts + tables.ts removidos)
- Tests: back 53/0 verde, front 89, e2e 10/10, tsc limpio

Cambios históricos no aplicados (fuera de alcance documentado):
- 1.3, 1.5, 1.8, 1.11, 2.1, 2.2, 3.3, 4.1-4.4, O.5: requieren features separadas o fueron descartados por el usuario

**Artefactos:**
- `proposal.md` — intención + alcance aprobados
- `validation.md` — acceptance criteria + Given-When-Then scenarios
- `design.md` — arquitectura técnica
- `tasks.md` — desglose de trabajo + estado final
- `audit-tablas.md` — auditoría de schema
- `specs/crm-core/spec.md` — delta spec (requisitos castellano + Supabase)

**Nota para el futuro:** Si es necesario reabrir este change, restaurar carpeta desde `openspec/changes/archive/2026-07-02-crm-castellano-supabase-total/` a `openspec/changes/crm-castellano-supabase-total/`.
