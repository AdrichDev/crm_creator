# Design — Migración CRM a Supabase

## Arquitectura objetivo (espejo de agents-agency)

```
Front CRM (Next)                Back CRM (Express/Prisma)        Supabase compartido
─────────────────               ─────────────────────────        ───────────────────
auth-client.ts ──login──▶ supabase.auth.signInWithPassword ──▶  auth.users
lib/api/client.ts ─Bearer+x-business-id─▶ /api/* (crudRouter) ─▶ Prisma ─▶ schema crm.*
  (getBackend → apiBackend)        middleware/auth verifySupabaseToken (JWKS ES256)
                                   Membership.businessId → tenant scoping
```

Regla AA replicada: **el front NO accede a datos directamente**. Auth por Supabase (browser), datos por Bearer al back. El back es la única autoridad de datos. `supabaseBackend` (front→Supabase directo) queda como camino muerto (no se usa cuando `NEXT_PUBLIC_API_URL` está set); se documenta como deuda a borrar.

## Decisiones

### D1 — Tenancy row-level (no schema-per-tenant)
El back ya aísla por `Membership.businessId` + header `x-business-id`. Se descarta `tenants_registry`/`crm_project`/`buildTenantSchemaSql`. Provisión de un proyecto nuevo = crear `Business` + `Membership` vía back (no crear schema Postgres). Migra cualquier dato de schemas dinámicos a filas con `businessId`.

### D2 — Verificación de token vía JWKS (ya implementada)
No se toca: `lib/auth.ts` verifica ES256 contra `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, `aud=authenticated`. Solo requiere `SUPABASE_URL` real (no placeholder) en `back/.env`.

### D3 — Activación por env, no por código
`getBackend()` ya conmuta: `isApiEnabled()` (`NEXT_PUBLIC_API_URL`) → `apiBackend`. Setear la env activa el camino REST y desactiva `localBackend`. No hay branch nuevo que escribir; sí verificación e2e.

### D4 — Esquema crm aditivo
`prisma migrate deploy` / `db push` con `schema=crm` en el `DATABASE_URL`. Migración **aditiva**: no DROP de objetos del schema `aa`. Workaround EPERM Windows en `prisma generate` ([[crm-prisma-migration-gotcha]]).

### D5 — Fix anti-deadlock onAuthStateChange
Si el hook de auth del front CRM (revisar `lib/auth/session.ts` + hook equivalente a `useAuthUser`) llama `supabase.auth.*` síncronamente dentro de `onAuthStateChange`, aplicar el mismo `setTimeout(…,0)` que en AA ([[aa-login-deadlock-onauthstatechange]]).

### D6 — `ai/generate` y `clients` sin pool docker
- `ai/generate`: la generación de schema/diseño deja de tocar Postgres docker. Si necesita persistir, lo hace vía back (Prisma→Supabase) o no persiste.
- `clients[/[id]]`: hoy `aaFetch` con cookie. AA usa Bearer. Migrar a Bearer (token de la sesión Supabase) o exponer el dato vía back CRM. Confirmar si el selector de clientes sigue necesitando datos de AA o se nutre de `crm.customer`.

## Variables de entorno (objetivo)

`back/.env`:
```
DATABASE_URL=postgresql://...@<supabase-host>:5432/postgres?schema=crm
SUPABASE_URL=https://<proj>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
CORS_ORIGIN=http://localhost:3002
PORT=4001
```

`front/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:4001
NEXT_PUBLIC_SUPABASE_URL=https://<proj>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
```

## Orden de ejecución y reversibilidad
- Fases 1-3 (esquema aditivo + config) = **reversibles**.
- Fase 4 (retirar provision/pool/docker, migrar datos) = **destructiva** → OK humano explícito.
- Fase 5 = verificación + archivo.

## Verificación
- Back: vitest verde + smoke `GET /api/customers` con token real.
- Front: playwright + e2e manual login→listar/crear cliente desde back (no localStorage).
- Confirmar que ninguna petición sale a `localhost:5434` ni a cookies AA.
