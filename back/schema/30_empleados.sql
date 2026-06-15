-- 30_empleados.sql — Módulo Empleados / Profesionales
create table if not exists app.empleados (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references app.tenants(id) on delete cascade,
  user_id      uuid references app.profiles(id) on delete set null, -- opcional: cuenta
  nombre       text not null,
  rol          text,
  especialidad text,
  email        text,
  estado       text not null default 'Activo',  -- Activo | Vacaciones | Baja
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_empleados_tenant on app.empleados(tenant_id);
drop trigger if exists trg_empleados_updated on app.empleados;
create trigger trg_empleados_updated before update on app.empleados
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.empleados');
