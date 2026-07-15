# Running e2e tests against local Supabase

The e2e suite (`src/**/*.e2e.test.ts`) creates **real** `auth.users` via
`admin.createUser`. Running it against a remote/prod project pollutes the org's
MAU and egress. `_shared.e2e.ts` therefore **aborts at import** unless
`SUPABASE_URL` is local (`127.0.0.1`/`localhost`) or `E2E_ALLOW_REMOTE=1` is set.

Target: a **local** Supabase stack. Test data lives and dies locally.

## Prerequisites

- **Docker Desktop running** (the local stack runs in containers).
- Supabase CLI (`npx supabase` — already available).

## One-time setup

Local config already committed at `supabase/config.toml`.

## Run flow

```bash
# 1. Boot the local stack (first run pulls images — a few minutes)
npx supabase start

# 2. Read the local keys
npx supabase status
#    -> copy "service_role key" and "anon key"

# 3. Create back/.env.test (NOT committed) with:
#    SUPABASE_URL=http://127.0.0.1:54321
#    SUPABASE_SERVICE_ROLE_KEY=<service_role key from step 2>
#    SUPABASE_ANON_KEY=<anon key from step 2>
#    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=crm
#    DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=crm
#    TEST_API_URL=http://localhost:4001
#    PORT=4001
#    ENABLE_CRONS=false

# 4. Bootstrap the schema on the local DB.
#    The repo's migration history assumes the crm/aa schemas already exist (they
#    were created out-of-band in prod), so `prisma migrate deploy` fails on a clean
#    DB. For a DISPOSABLE local DB, create the schemas and push the schema state.
#    The ?schema=crm on DATABASE_URL is REQUIRED (single-schema; sets search_path).
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c 'CREATE SCHEMA IF NOT EXISTS crm; CREATE SCHEMA IF NOT EXISTS aa;'
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=crm" npx prisma db push --accept-data-loss

# 5. Start the back against local Supabase (separate terminal)
npm run start:test

# 6. Run the e2e suite against local
npm run test:e2e:local

# 7. Tear down when done (removes all local test data)
npx supabase stop
```

## Notes

- `.env.test` must never point at a remote project. The guard blocks it; the
  `E2E_ALLOW_REMOTE=1` escape hatch exists only for deliberate, throwaway checks.
- Local data is disposable: `supabase stop` (or `supabase db reset`) wipes it.
  No cleanup script needed for local runs — but `scripts/purge-test-residue.mjs`
  remains for emergency cleanup if someone ever forces a remote run.
