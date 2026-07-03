# Proposal: crm-e2e-aislamiento-bd

## Problema

Los e2e de `creador_CRM/back` escriben en la BD Supabase REAL y dejan basura:

1. `npm test` (`package.json:15`) ejecuta `src/**/*.test.ts` — unit Y e2e live juntos.
   Cualquier `npm test` casual dispara escrituras contra producción (vía el back vivo).
2. El cleanup `after()` de los e2e falla en silencio: el proceso node:test no carga
   dotenv (solo `src/env.ts` lo hace, y los tests no lo importan), así que
   `prisma.business.delete` lanza sin `DATABASE_URL` y el `.catch(() => {})` lo traga.
   Evidencia: 10 negocios "Biz XXXXXX" huérfanos en `crm.negocio` (03/07/2026) y
   decenas de usuarios `*@test.local` en `auth.users`.

## Solución (dos capas)

1. **Separación de scripts**: `npm test` = solo tests puros (unit + los `*.test.ts` de
   routes sin BD). Nuevo `test:e2e` = solo `*.e2e.test.ts`, opt-in explícito.
   `test:all` = ambos. README actualizado.
2. **Cleanup fiable**:
   - El helper compartido de e2e (`_shared.e2e.ts`) y los ficheros con cleanup local
     cargan `dotenv/config` para que el proceso de test tenga `DATABASE_URL`.
   - Los `.catch(() => {})` de cleanup pasan a loggear el error (`console.error`) en
     vez de tragarlo — el run no falla, pero la fuga se ve.
   - Nuevo script `scripts/purge-test-residue.mjs`: borra negocios `Biz %`/`TzBiz%`
     sin membresía real y usuarios `%@test.local`, con `--dry-run` por defecto y
     `--apply` para ejecutar. Documentado en README.

Fuera de alcance: BD de test aislada (branch Supabase / postgres local) — mejora
posterior, requiere decisión de infra/coste.

## Alcance

- `creador_CRM/back/package.json` (scripts).
- `creador_CRM/back/src/routes/__tests__/_shared.e2e.ts` + ficheros e2e con cleanup local.
- `creador_CRM/back/scripts/purge-test-residue.mjs` (nuevo).
- `creador_CRM/back/README.md`.
