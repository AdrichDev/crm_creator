-- ============================================================================
-- 00_core.sql — Núcleo multi-tenant (Supabase / PostgreSQL)
-- Siempre se incluye. Define tenants, perfiles, registro de módulos, branding,
-- helpers de RLS y triggers comunes. No contiene credenciales.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Esquema de aplicación
-- ---------------------------------------------------------------------------
create schema if not exists app;

-- updated_at automático
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo de verticales y módulos (enums)
-- ---------------------------------------------------------------------------
do $$ begin
  create type app.vertical_id as enum (
    'peluqueria','estetica','hosteleria','fitness','escalada',
    'clinica','taller','veterinario','custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.module_id as enum (
    'dashboard','clientes','citas','servicios','empleados','fichaje',
    'vacaciones','productos','ventas','web','marketing','configuracion'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tenants (cada negocio)
-- ---------------------------------------------------------------------------
create table if not exists app.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique,
  vertical      app.vertical_id not null default 'custom',
  phone         text,
  email         text,
  address       text,
  -- branding
  brand_primary    text not null default '#1b431c',
  brand_secondary  text not null default '#8cc63f',
  brand_logo_text  text,
  setup_complete   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_tenants_updated on app.tenants;
create trigger trg_tenants_updated before update on app.tenants
  for each row execute function app.set_updated_at();

-- Módulos activos por tenant (qué "toma" cada negocio)
create table if not exists app.tenant_modules (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  module     app.module_id not null,
  enabled    boolean not null default true,
  primary key (tenant_id, module)
);

-- Overrides de terminología por tenant (clave -> etiqueta visible)
create table if not exists app.tenant_terms (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  term_key   text not null,
  label      text not null,
  primary key (tenant_id, term_key)
);

-- Ajustes libres por categoría (equivalente a settings de ExceliaTrack)
create table if not exists app.tenant_settings (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  category   text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, category)
);

-- ---------------------------------------------------------------------------
-- Perfiles de usuario (vinculados a auth.users de Supabase) y pertenencia
-- ---------------------------------------------------------------------------
do $$ begin
  create type app.user_role as enum ('owner','admin','manager','empleado');
exception when duplicate_object then null; end $$;

create table if not exists app.profiles (
  id          uuid primary key,           -- = auth.users.id
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Un usuario puede pertenecer a uno o varios tenants con un rol
create table if not exists app.memberships (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  user_id    uuid not null references app.profiles(id) on delete cascade,
  role       app.user_role not null default 'empleado',
  primary key (tenant_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Helpers de Row Level Security
-- ---------------------------------------------------------------------------
-- Tenants a los que pertenece el usuario autenticado
create or replace function app.user_tenant_ids()
returns setof uuid language sql stable security definer set search_path = app as $$
  select tenant_id from app.memberships where user_id = auth.uid();
$$;

-- Comodín para activar RLS estándar "solo mi tenant" en una tabla con tenant_id
create or replace function app.enable_tenant_rls(p_table regclass)
returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format($f$
    drop policy if exists tenant_isolation on %1$s;
    create policy tenant_isolation on %1$s
      using (tenant_id in (select app.user_tenant_ids()))
      with check (tenant_id in (select app.user_tenant_ids()));
  $f$, p_table);
end;
$$;

-- RLS de las tablas core
alter table app.tenants          enable row level security;
alter table app.tenant_modules   enable row level security;
alter table app.tenant_terms     enable row level security;
alter table app.tenant_settings  enable row level security;
alter table app.memberships      enable row level security;

drop policy if exists tenants_self on app.tenants;
create policy tenants_self on app.tenants
  using (id in (select app.user_tenant_ids()))
  with check (id in (select app.user_tenant_ids()));

drop policy if exists tmod_self on app.tenant_modules;
create policy tmod_self on app.tenant_modules
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists tterm_self on app.tenant_terms;
create policy tterm_self on app.tenant_terms
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists tset_self on app.tenant_settings;
create policy tset_self on app.tenant_settings
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists memb_self on app.memberships;
create policy memb_self on app.memberships
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));
