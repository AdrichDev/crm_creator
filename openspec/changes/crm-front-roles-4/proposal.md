# Proposal — Alinear MemberRole del front a los 4 roles reales (crm-front-roles-4)

**Nivel Gru: 2 — Medio.** 3 ficheros (1 type + 1 comentario + 1 test), 1 dominio (auth/roles), reversible, sin migración.
**Estado: APROBADO (2026-06-28) — redo bajo SDD tras revert previo.**

## Contexto

El front declara `MemberRole` (`front/lib/auth/session.ts`) con 8 valores, incluyendo legacy
OWNER, RECEPTIONIST, PROFESSIONAL, ACCOUNTANT. El backend tiene EXACTAMENTE 4 roles
(`crm.MemberRole`: ADMIN, MANAGER, EMPLOYEE, CLIENT — ver memoria crm-memberrole-4). El
mapeo `roleFromMembership` tiene un branch OWNER muerto (el back nunca envía OWNER).

`front/lib/config/roles.ts` (`MEMBER_ROLE_LABEL`) YA tiene solo los 4 roles correctos, así que
la divergencia vive únicamente en `session.ts` (type + branch), un comentario en
`lib/api/profile.ts`, y un test en `tests/session.test.ts`.

## Intención

Alinear el contrato del front al enum real de 4 roles. Cero cambio de comportamiento para los
roles que el back realmente envía (MANAGER/EMPLOYEE ya caían a 'trabajador'; OWNER ya no llega).

## Decisiones técnicas

- `MemberRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CLIENT'`.
- `roleFromMembership`: ADMIN→'admin', CLIENT→'cliente', resto (MANAGER/EMPLOYEE/undefined)→'trabajador'.
- Si en runtime llegara un rol desconocido → 'trabajador' (downgrade fail-safe, nunca escalada).
- NO tocar `lib/data/backend.ts` (modo demo/localStorage) — es intencional y está protegido.

## Alcance

1. `front/lib/auth/session.ts` — `MemberRole` (8→4) + `roleFromMembership` (quitar branch OWNER).
2. `front/lib/api/profile.ts` — comentario del campo `role` (quitar OWNER del ejemplo).
3. `front/tests/session.test.ts` — sustituir test `OWNER → admin` por `MANAGER → trabajador`.

## Fuera de alcance

- Modo demo/localStorage en `backend.ts` (intencional, protegido por crm-no-cambiar-ux-generador).
- Contrato de tipos compartido back/front en paquete común (evolución futura).

## Riesgos

- Si algún consumidor pasara un literal legacy a un parámetro `MemberRole`, daría error de tipo
  (lo deseado: lo detecta tsc). Verificado: solo session.ts/profile.ts/tests referencian el type.
