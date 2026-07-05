# Tasks — crm-front-roles-4  (Nivel 2 — APROBADO)

> Diseño en `proposal.md`. Redo bajo SDD tras revert previo (front/lib/auth/session.ts volvió a 8 roles).

> NOTA: este cambio NO fue revertido (el revert fue solo en agents-agency). El código ya estaba
> aplicado; esta spec lo documenta retroactivamente bajo SDD. Verificado intacto 2026-06-28.

## Fase A — Implementación
- [x] A.1 `front/lib/auth/session.ts`: `MemberRole` → 4 valores; `roleFromMembership` sin branch OWNER.
- [x] A.2 `front/lib/api/profile.ts`: comentario del campo `role` → ADMIN/MANAGER/EMPLOYEE/CLIENT.
- [x] A.3 `front/tests/session.test.ts`: test `OWNER → admin` → `MANAGER → trabajador`.

## Fase B — Verificación
- [x] B.1 `npx tsc --noEmit` limpio. (2026-06-28)
- [x] B.2 `npm test` (CRM front) verde — 179 pass.
- [x] B.3 Grep: sin OWNER/RECEPTIONIST/PROFESSIONAL/ACCOUNTANT en fuente (salvo comentario + test defensivo).

## Tras verde: gate Agentic Runtime ANTES de cualquier commit/push.
- [x] Agentic Runtime PASS — ya revisado y aprobado por Agentic Runtime previamente (sin findings).
