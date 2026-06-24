# Proposal — Migración CRM a Supabase (paridad con agents-agency)

**Nivel Gru: 3 — Large** (datos persistentes, migración, retira acoplamiento docker). Fase 4 destructiva → **HUMAN-IN-THE-LOOP** antes de ejecutar.
**Estado: PENDIENTE.** Requiere aprobación humana + credenciales Supabase antes de Fase 1.

## Intención
Dejar `creador_CRM` consumiendo datos y auth desde el **Supabase compartido** (plan de consolidación: 1 Supabase, schemas `aa`/`crm`), idéntico en arquitectura a `agents-agency`. Hoy el CRM corre en **modo local** (front en `localStorage`, rutas con pool a Postgres docker) pese a tener el back ya migrado a auth Supabase + CRUD REST completo.

## Diagnóstico (auditoría 2026-06-19)
- **Back CRM (`back/`, :4001) ya es espejo de AA:** auth Supabase JWKS ES256 (`lib/auth.ts`), Prisma `DATABASE_URL`, CRUD REST de todos los módulos vía `crudRouter` (/customers, /services, /employees, /products, /sales, /invoices, /campaigns, /fichajes, /bookings…), multi-tenant `Membership` + header `x-business-id`. **Cero código nuevo.**
- **Front CRM:** cableado Supabase + REST ya existe pero apagado. `lib/api/client.ts` = REST Bearer-desde-sesión-Supabase + `x-business-id` (espejo de AA `api.ts`). `getBackend()` prioriza `apiBackend` si `NEXT_PUBLIC_API_URL`, si no cae a `localBackend` (localStorage). Hoy corre localStorage porque la env no está seteada → de ahí "consume local".
- **Acoplamiento docker/local a retirar:** `app/api/projects/provision` (pool docker, schema-por-proyecto), `app/api/ai/generate` (pool docker), `app/api/clients[/[id]]` (`aaFetch` por cookie, roto: AA ya usa Bearer), `lib/server/db.ts`, `lib/server/aa.ts`, `docker-compose` `db-crm` pgvector:5434.

## Alcance
1. Aplicar esquema Prisma CRM al Supabase compartido en schema `crm` (aditivo, sin DROP de `aa`).
2. Apuntar back (`DATABASE_URL`, `SUPABASE_URL`, `SERVICE_ROLE_KEY`) al Supabase.
3. Activar front vía env (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_*`) → `getBackend()` pasa a REST; localStorage muere.
4. Aplicar fix anti-deadlock `onAuthStateChange` en el auth del front CRM si reproduce el bug de AA ([[aa-login-deadlock-onauthstatechange]]).
5. Retirar acoplamiento docker: `provision` → provisión **row-level** (`Business`+`Membership`), `ai/generate` fuera del pool, `clients` cookie→Bearer, borrar `lib/server/db.ts`, retirar `db-crm` de compose.
6. Migrar datos vivos docker→Supabase si los hay.

## Decisión de tenancy (aprobada)
**Row-level** por `businessId`/`tenant_id` en schema `crm`. Se **mata** el modelo schema-per-tenant de `provision`. Coherente con el back actual, con AA y con el plan de consolidación.

## Fuera de alcance
- Cambios de UI/pantallas (no cambian).
- Rediseño del modelo de datos del back (ya está).
- RLS fino sobre `crm.*` más allá de lo que ya define `data-client.ts` (se valida, no se rehace).

## Riesgos
- **Migración de datos** persistentes (docker→Supabase): irreversible si se borra docker. Gate humano.
- Gotcha Windows `prisma generate` EPERM ([[crm-prisma-migration-gotcha]]); migración **aditiva** sin DROP de tablas `aa`.
- `provision` schema-per-tenant en uso por algún proyecto vivo → confirmar que ningún dato depende de schemas dinámicos antes de retirarlo.
- `service_role key` NUNCA al navegador (solo back).
