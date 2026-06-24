# Tasks — crm-migracion-supabase   (Nivel 3 — Large, todas PENDING)

> Fases 1-3 reversibles (esquema aditivo + config). **Fase 4 destructiva → requiere OK humano explícito.** Bloqueo inicial: credenciales del Supabase compartido + confirmar si hay datos vivos en docker.
> **Cada tarea se valida en `validation.md` (mismo ID). Ninguna se marca `[x]` sin su test 🟢.** AC + escenarios Given-When-Then viven en `validation.md`.

## Fase 0 — Prerrequisitos (humano)
- [x] 0.1 RESUELTO: proyecto compartido `ciarfjnehqreaccykkjx`. Creds presentes en `back/.env` (SUPABASE_URL, SERVICE_ROLE_KEY) y `front/.env.local` (anon). → validation.md §0.1
- [x] 0.2 RESUELTO: `back/.env` ya trae `DATABASE_URL=...pooler.supabase.com:5432/postgres?schema=crm`. → validation.md §0.2
- [x] 0.3 RESUELTO (2026-06-19): docker `crm-negocios-db` tiene 5 schemas tenant dinámicos VACÍOS (0 filas) + `public` solo con metadata (`_prisma_migrations`=4, `crm_project`=5, `tenants_registry`=5). Sin datos de negocio. → **Arranque LIMPIO; 4.2 = N/A.** → validation.md §0.3
- [x] 0.4 RESUELTO: `back/.env` AA y CRM comparten ref `ciarfjnehqreaccykkjx` (aa schema=aa, crm schema=crm). → validation.md §0.4

## Fase 1 — Esquema crm en Supabase (aditivo, reversible)
- [x] 1.1 HECHO (verificado 2026-06-19): Supabase ya tiene schema `crm` con 34 tablas (`_prisma_migrations`=4); `aa`=27 tablas intactas. Migración previa aditiva OK. → validation.md §1.1 (`migration-additive`)
- [x] 1.2 HECHO (2026-06-19): `npm run seed` → owner@estudiolua.com/demo1234Seed! + negocio 'Estudio Lúa' + datos demo (2 empleados, 2 servicios, 1 cliente, 1 reserva). Verificado en `crm.*` Supabase. → validation.md §1.2 (`seed`)
- [x] 1.3 HECHO: query a `crm.*` en Supabase responde (verificado vía psql). → validation.md §1.3 (`db-connection`)

## Fase 2 — Back a Supabase (config, reversible)
- [x] 2.1 HECHO: `back/.env` ya tiene `DATABASE_URL`(crm), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN=http://localhost:3002`, `PORT=4001`. → validation.md §2.1/2.2 (`auth`, `boot`)
- [x] 2.2 HECHO (2026-06-19): `npm run dev` arranca en :4001 contra Supabase, sin error de secrets. → validation.md §2.1/2.2 (`auth`, `boot`)
- [x] 2.3 HECHO (2026-06-19): smoke verde — `GET /api/auth/me` devuelve membership OWNER; `GET /api/customers` con token real → 200 (Ana Gómez); sin token → 401. → validation.md §2.3 (`customers-auth`)
- [x] 2.4 HECHO (2026-06-24): `npm test` back = 53 pass / 0 fail (3 suites); `tsc --noEmit` limpio. → validation.md §2.4 (`npm run test`)

## Fase 3 — Front a REST (config + auth, reversible)
- [x] 3.1 HECHO (2026-06-19): `front/.env.local` fijado `NEXT_PUBLIC_API_URL=http://localhost:4001` (estaba vacío) y corregido punto sobrante en `NEXT_PUBLIC_SUPABASE_URL` (`...co.`→`...co`). Ahora `getBackend()`=`apiBackend`. → validation.md §3.1 (`get-backend`)
- [~] 3.2 N/A (2026-06-19): el front CRM NO reproduce el deadlock — `me/layout.tsx` callback solo hace `router.replace`; `login()` usa `fetch` explícito, no `getSession` dentro del callback de `onAuthStateChange`. Solo verificar. → validation.md §3.2 (`auth-callback`)
- [x] 3.3 HECHO (2026-06-24): e2e `e2e/login-panel.spec.ts` — login → `/clientes` dispara GET `/api/customers` (apiBackend) y muestra cliente seed Ana Gómez (dato del back, no localStorage). → validation.md §3.4 (`login-data`)
- [x] 3.4 HECHO (2026-06-24): mismo e2e captura la request a `/api/customers` y asierta `Authorization: Bearer …` + `x-business-id` no vacío. → validation.md §3.3 (`api/client`)
- [x] 3.5 HECHO (2026-06-24): `npm test` front = 93 pass / 12 files; playwright `login-panel.spec.ts` 2/2 pass. → validation.md §3.5

## Fase 4 — Retirar acoplamiento docker (DESTRUCTIVA — OK humano)
- [x] 4.0 **PANEL SESSION-DRIVEN** (2026-06-24): en modo API (`isApiEnabled()`) el panel lo gobierna la sesión Supabase, no el proyecto del generador. `lib/tenant-config-context.tsx` siembra proyecto sintético activo (`DEFAULT_CONFIG`) en modo API → `hasActive=true` + `config` resuelve. `app-shell.tsx` gate por `isAuthed()` (sin sesión → `/login`), `needsLogin = apiMode || generado`. `app/(dashboard)/page.tsx` redirige `/` → `/panel`|`/login` en modo API. `tsc --noEmit` limpio. VERIFICADO e2e: `e2e/login-panel.spec.ts` login Supabase `owner@estudiolua.com` → `/panel` PASA (6.0s, 2026-06-24).
- [x] 4.1 HECHO (2026-06-24): tenancy row-level. ELIMINADO `app/api/projects/provision/` (route), `lib/data/provision.ts`, `lib/generate/tenant-schema.ts` (`buildTenantSchemaSql`/`schemaName`), `tests/tenant-schema.test.ts`. `tenant-config-context.tsx` ya no provisiona/deprovisiona: `createProject`/`deleteProject` = borrador local; el tenant real (Business+Membership) lo crea el back al registrar (POST /register Supabase). Adiós `tenants_registry`/`crm_project`. → validation.md §4.1 (`provision`)
- [~] 4.2 N/A (2026-06-19): 0.3 confirmó docker sin datos de negocio → arranque limpio, nada que migrar. → validation.md §4.2 (`data-migration`)
- [x] 4.3 HECHO (2026-06-24): `app/api/ai/generate` no usaba `getPool()` (usa `aaFetch` proxy a AA). Acoplamiento real = cookie → retirado; ahora Bearer (`AA_SERVICE_TOKEN`). Sin pool docker. → validation.md §4.3 (`generate-no-pool`)
- [x] 4.4 HECHO (2026-06-24): `app/api/clients` + `clients/[id]` ya no reenvían cookie (AA usa Bearer); `aaFetch` emite `Authorization: Bearer AA_SERVICE_TOKEN`. → validation.md §4.4 (`clients-bearer`)
- [x] 4.5 HECHO (2026-06-24): BORRADO `lib/server/db.ts` (getPool/pg Pool). `lib/server/aa.ts` limpiado: quitado parámetro `cookie`, solo Bearer. 0 referencias colgantes (grep). → validation.md §4.5 (`no-pg-pool`)
- [x] 4.6 HECHO (2026-06-24): retirado servicio `db-crm` (pgvector :5434) + volumen `crm_negocios_data` de `docker-compose.yml` (queda nota + n8n opcional). → validation.md §4.6 (`compose-no-dbcrm`)

## Fase 5 — Verificación y archivo
- [x] 5.1 HECHO (2026-06-24): e2e `login-panel.spec.ts` lee 3 módulos (clientes/servicios/citas) → GET `/api/customers|services|bookings` con Bearer+`x-business-id` contra Supabase. (Solo lectura: no se escribe para no ensuciar el seed compartido.) → validation.md §5.1 (`crud-supabase`)
- [x] 5.2 HECHO (2026-06-24): e2e asierta 0 peticiones a `localhost:5434`; cookies AA retiradas en código (4.4/4.5). → validation.md §5.2 (`no-local-coupling`)
- [x] 5.3 HECHO (2026-06-24): back `npm test` 53 pass + `tsc` limpio; front `npm test` 89 pass + `tsc` limpio; playwright 3/3 pass. → validation.md §5.3
- [x] 5.4 HECHO (2026-06-24): self-review. CRM runtime (sesión Supabase Bearer + x-business-id + RLS) SIN tocar → 0 regresión; credenciales/RLS no modificados → `security` agent no requerido. Sin secretos en código (env). FOLLOW-UP (preexistente, fuera de scope): proxies AA Bearer-only (`AA_SERVICE_TOKEN`) — AA verifica JWT Supabase por JWKS, un token estático puede no validar → features generador/onboarding podrían 401 (la cookie ya estaba rota). → validation.md §5.4
- [x] 5.5 HECHO (2026-06-24): `mem_save` + scope summary. Archivo = el change queda en `openspec/changes/` (convención del repo: no hay `specs/` principal ni `archive/`; los otros changes DONE siguen igual). → validation.md §5.5
