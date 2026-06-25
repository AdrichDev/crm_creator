-- 20_servicios.sql — Módulo Servicios / Tratamientos / Tarifas
create table if not exists app.servicios (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  nombre      text not null,
  categoria   text,
  duracion_min integer not null default 30,
  precio      numeric(12,2) not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_servicios_tenant on app.servicios(tenant_id);
drop trigger if exists trg_servicios_updated on app.servicios;
create trigger trg_servicios_updated before update on app.servicios
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.servicios');
