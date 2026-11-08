-- =============================================================================
-- check-security.sql — read-only posture check for the tenant schema
-- =============================================================================
--
-- PURPOSE
--   Reads the Postgres catalogs and prints the facts behind
--   docs/tenant-isolation.md ("Database posture"):
--     0. which role this session is running as (compare with query 4: if the API
--        connects as the table owner, RLS policies are NOT applied to it);
--     1. tables that do not have Row Level Security (RLS) enabled;
--     2. tables that have FORCE ROW LEVEL SECURITY (expected: none — it would
--        break the API, see docs/tenant-isolation.md);
--     3. table privileges held by the Supabase `anon` and `authenticated` roles;
--     4. owner of each table;
--     5. the policies defined on each table.
--
-- HOW TO RUN
--   As the role that owns the schema (the same credential the API uses), from
--   the repository root:
--
--       psql "$DATABASE_URL" -f db/check-security.sql
--
--   This file contains SELECT statements over catalogs only: no DDL, no DML, no
--   SET ROLE. It is safe to point at production, but run it against a read-only
--   connection when you can.
--
-- SCHEMA PARAMETER
--   The schema name is the psql variable `schema`, set on the next line. Change
--   it there (e.g. `\set schema public`) — every query below uses :'schema' and
--   never hardcodes `crm`.
--
-- CI
--   Do NOT enable this in CI with the migration/API credential. The disabled
--   `rls-posture` job in .github/workflows/security.yml requires a dedicated
--   read-only DSN secret; see the comment in that file.
-- =============================================================================

\set schema crm

-- -----------------------------------------------------------------------------
-- 0. Current role (informational).
--    Healthy: this is the role from DATABASE_URL. Compare it with the owners in
--    query 4: a table owned by the current role exempts its owner from RLS, so
--    the policies listed in query 5 never run for this connection.
-- -----------------------------------------------------------------------------
SELECT current_user AS api_role,
       session_user AS session_role,
       current_database() AS database_name;

-- -----------------------------------------------------------------------------
-- 1. Tables in the schema WITHOUT RLS enabled.
--    Healthy: this is the expected, documented state — tenant isolation is done
--    in the API (docs/tenant-isolation.md), so tables here are the norm. What
--    matters is that no table a *direct* Supabase client reads appears in this
--    list; those must be in query 5.
-- -----------------------------------------------------------------------------
SELECT n.nspname AS schema_name,
       c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = :'schema'
  AND c.relkind IN ('r', 'p')
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- -----------------------------------------------------------------------------
-- 2. Tables WITH FORCE ROW LEVEL SECURITY.
--    Healthy: ZERO rows. A row here means the owner (the API) is also subject to
--    the policies, which are written for `authenticated` + auth.uid() — the API
--    has no auth.uid(), so its queries would return no rows and writes would be
--    rejected. Remove FORCE RLS if one shows up.
-- -----------------------------------------------------------------------------
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = :'schema'
  AND c.relkind IN ('r', 'p')
  AND c.relforcerowsecurity = true
ORDER BY c.relname;

-- -----------------------------------------------------------------------------
-- 3. Privileges of `anon` and `authenticated` on the schema's tables.
--    Healthy for this project: `anon` holds nothing on these tables, and
--    `authenticated` only holds what a direct Supabase client needs on tables
--    covered by query 5 (today: SELECT, filtered by auth.uid()). Any table that
--    appears in query 1 (no RLS) must NOT appear here.
--
--    Caveat: information_schema.role_table_grants only reports grants where the
--    grantor or the grantee is a role enabled in this session, so it needs an
--    owner-like role (the one from DATABASE_URL) to be complete. A role that
--    does not exist in a self-hosted database (no Supabase) simply contributes
--    no rows.
-- -----------------------------------------------------------------------------
SELECT g.table_schema AS schema_name,
       g.table_name,
       g.grantee,
       g.privilege_type,
       g.is_grantable
FROM information_schema.role_table_grants g
WHERE g.table_schema = :'schema'
  AND g.grantee IN ('anon', 'authenticated')
ORDER BY g.table_name, g.grantee, g.privilege_type;

-- -----------------------------------------------------------------------------
-- 4. Owner of each table.
--    Healthy: every table in the schema has the SAME owner, and that owner is
--    the role from query 0 (the API credential). That is the documented posture:
--    the API is the owner and therefore bypasses RLS. Mixed owners mean a second
--    deployment path is creating tables with different credentials — investigate
--    before trusting either isolation story.
-- -----------------------------------------------------------------------------
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = :'schema'
  AND c.relkind IN ('r', 'p')
ORDER BY pg_get_userbyid(c.relowner), c.relname;

-- -----------------------------------------------------------------------------
-- 5. Policies defined per table.
--    Healthy: only tables that a direct Supabase client reads (today the ones
--    created with ENABLE ROW LEVEL SECURITY in back/prisma/migrations) appear,
--    every policy targets a named role (never PUBLIC), and each qual is written
--    in terms of auth.uid() / crm.membresia. Zero policies does not mean the API
--    is broken: the API does not evaluate policies at all.
-- -----------------------------------------------------------------------------
SELECT p.schemaname AS schema_name,
       p.tablename AS table_name,
       p.policyname,
       p.permissive,
       p.roles,
       p.cmd,
       p.qual,
       p.with_check
FROM pg_policies p
WHERE p.schemaname = :'schema'
ORDER BY p.tablename, p.policyname;
