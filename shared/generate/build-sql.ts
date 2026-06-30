/**
 * shared/generate/build-sql.ts
 *
 * Pure SQL generation for CRM multi-tenant schema.
 * Zero browser / React / Next.js dependencies.
 */

import type { TenantConfig, ModuleId, GenTable } from './tenant-types';
import { MODULE_TABLES, RELATIONS } from './tenant-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATA_ORDER: ModuleId[] = [
  'clientes', 'servicios', 'empleados', 'citas', 'fichaje',
  'vacaciones', 'productos', 'ventas', 'facturas', 'marketing',
];

export function activeDataModules(cfg: TenantConfig): ModuleId[] {
  return DATA_ORDER.filter((m) => cfg.modules[m]);
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'proyecto';
}

// ---------------------------------------------------------------------------
// Multi-tenant SQL core (always included)
// ---------------------------------------------------------------------------

const CORE_SQL = `-- Núcleo multi-tenant
create extension if not exists "pgcrypto";
create schema if not exists app;

create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create table if not exists app.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  vertical text not null default 'custom',
  phone text, email text, address text,
  brand_primary text not null default '#1b431c',
  brand_secondary text not null default '#8cc63f',
  brand_logo_text text,
  setup_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.tenant_modules (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  module text not null,
  enabled boolean not null default true,
  primary key (tenant_id, module)
);

create or replace function app.user_tenant_ids()
returns setof uuid language sql stable security definer set search_path = app as $$
  select tenant_id from app.tenant_modules where false; -- reemplazar por memberships al añadir auth
$$;

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
end; $$;`;

function tableSql(t: GenTable): string {
  const cols = t.cols.map((c) => `  ${c.name} ${c.sql},`).join('\n');
  return `create table if not exists app.${t.table} (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
${cols}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_${t.table}_tenant on app.${t.table}(tenant_id);
drop trigger if exists trg_${t.table}_updated on app.${t.table};
create trigger trg_${t.table}_updated before update on app.${t.table}
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.${t.table}');`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildSql(cfg: TenantConfig): string {
  const mods = activeDataModules(cfg);
  const present = new Set(mods);
  const parts: string[] = [
    `-- Esquema generado para: ${cfg.business.name}`,
    `-- Vertical: ${cfg.business.vertical} | Módulos: ${mods.join(', ') || '(ninguno)'}`,
    `-- Generado: ${new Date().toISOString()}`,
    CORE_SQL,
  ];
  for (const m of mods) {
    for (const t of MODULE_TABLES[m] ?? []) parts.push(tableSql(t));
  }
  const rels = RELATIONS.filter((r) => present.has(r.module) && present.has(r.needs));
  if (rels.length) {
    parts.push('-- Relaciones entre módulos');
    for (const r of rels) {
      parts.push(
        `alter table app.${r.table} drop constraint if exists ${r.name};\n` +
        `alter table app.${r.table} add constraint ${r.name}\n` +
        `  foreign key (${r.col}) references app.${r.ref}(id) on delete set null;`,
      );
    }
  }
  return parts.join('\n\n') + '\n';
}
